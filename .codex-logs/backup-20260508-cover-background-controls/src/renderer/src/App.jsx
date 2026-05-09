/*
 * App.jsx is a legacy integration surface. Keep new feature logic in focused
 * components, utils, config, main/preload modules, or styles first.
 * Read docs/APP_JSX_CHANGE_MAP.md before editing this file.
 */
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  memo,
  startTransition,
  useDeferredValue
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import sidebarLogoImage from '../../../1.png'
import {
  FolderHeart,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Download,
  FileOutput,
  Disc,
  Music,
  X,
  Square,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  FileAudio,
  Trash2,
  Mic2,
  ChevronLeft,
  Search,
  Globe,
  Link,
  Settings,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Info,
  Zap,
  Image,
  MessageSquare,
  Palette,
  Wand2,
  CheckCircle2,
  ChevronDown,
  Check,
  Minus,
  ListMusic,
  ListPlus,
  Plus,
  Upload,
  Pencil,
  MoreHorizontal,
  Film,
  Radio,
  Users,
  Terminal,
  Heart,
  FolderOpen,
  Copy,
  AppWindow,
  Blocks,
  Headphones,
  History,
  GripVertical,
  Tag,
  Gauge,
  RotateCcw,
  Smartphone,
  Cast,
  PictureInPicture2
} from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import LyricsSettingsDrawer from './components/LyricsSettingsDrawer'
import MediaDownloaderDrawer from './components/MediaDownloaderDrawer'
import MvSettingsDrawer from './components/MvSettingsDrawer'
import AudioSettingsDrawer from './components/AudioSettingsDrawer'
import CastReceiveDrawer from './components/CastReceiveDrawer'
import CastSendDrawer from './components/CastSendDrawer'
import ListenTogetherDrawer from './components/ListenTogetherDrawer'
import PhoneRemoteDrawer from './components/PhoneRemoteDrawer'
import AccountLoginSettings from './components/AccountLoginSettings'
import RemoteLibrarySettings from './components/RemoteLibrarySettings'
import RemoteLibraryView from './components/RemoteLibraryView'
import StreamingView from './components/StreamingView'
import StreamingPlaybackTags from './components/StreamingPlaybackTags'
import QueueSidebarView from './components/QueueSidebarView'
import HistorySidebarView from './components/HistorySidebarView'
import PlayerProgressControl from './components/PlayerProgressControl'
import LyricsCandidatePicker from './components/LyricsCandidatePicker'
import MetadataEditorDrawer from './components/MetadataEditorDrawer'
import ImportedFolderRail from './components/ImportedFolderRail'
import FolderTreeBrowser from './components/FolderTreeBrowser'
import { UiButton } from './components/ui'
import AudioQualityBadges from './components/AudioQualityBadges'
import { parseAnyLyrics } from './utils/lyricsParse'
import { getActiveLyricIndex } from '../../shared/lyricsTimeline.mjs'
import { getLocalLyricsSourceOrder } from '../../shared/lyricsSourcePriority.mjs'
import { buildRomajiConversionPlan, rememberRomajiCacheValue } from '../../shared/romajiText.mjs'
import {
  isAutoLyricsCandidateAccepted,
  isLikelyInstrumentalTrack,
  isOnlineLyricsOverrideSource,
  pickLyricsFromLrcLibResult,
  rankLrcLibCandidates
} from './utils/lyricsCandidateRank'
import {
  clearMediaSession,
  clearMediaSessionHandlers,
  installMediaSessionHandlers,
  syncMediaSessionMetadata,
  syncMediaSessionPlayback
} from './utils/mediaSession'
import {
  getLyricsInstrumentalFlagForPath,
  getLyricsOverrideForPath,
  getLyricsSourcePreferenceForPath,
  normalizeLyricsSourcePreference,
  setLyricsInstrumentalFlagForPath,
  setLyricsOverrideForPath,
  setLyricsSourcePreferenceForPath,
  clearLyricsOverrideForPath,
  remapLyricsOverrides
} from './utils/lyricsOverrideStorage'
import {
  getMvOverrideForPath,
  setMvOverrideForPath,
  remapMvOverrides
} from './utils/trackMemoryStorage'
import { resolveDownloadedSourceMv } from './utils/mvSourceResolve'
import { buildDesktopLyricsPayload } from './utils/desktopLyricsPayload'
import { buildMiniPlayerPayload } from './utils/miniPlayerPayload'
import { matchesSettingsSection } from './utils/settingsSearch'
import { PRESET_THEMES, hexToRgbStr, hexToRgbaString, generateRandomPalette } from './utils/color'
import {
  getUiFontStack,
  buildUiCustomFontFaceCss,
  UI_CJK_CUSTOM_FONT_FAMILY,
  normalizeThemeColors,
  getAppThemeBackgroundStyle
} from './utils/themeColors'
import { pickThemeExportSlice, mergeThemeImport, parseThemeBundleJson } from './utils/themeBundle'
import { buildSettingsExportBundle, parseSettingsImportText } from './utils/configBundle'
import {
  buildParsedPlaylistWithCache,
  parseTrackInfo,
  compareTrackOrder,
  compareTrackFrequent,
  compareTrackRandom,
  getEffectiveTrackMeta,
  stripExtension,
  parseArtistTitleFromName,
  resolveTrackIdentityFromMetadata
} from './utils/trackUtils'
import { filterAndRankTracksBySearch, getTrackSearchScore } from './utils/librarySearch'
import {
  buildFolderHierarchy,
  filterFolderHierarchy,
  flattenFolderHierarchy
} from './utils/folderHierarchy'
import {
  buildLastFmTrackIdentity,
  buildLastFmTrackPayload,
  getLastFmScrobbleThresholdSec
} from './utils/lastfmTrackPayload'
import {
  buildDiscordPresenceActivity,
  buildDiscordPresenceSignature
} from './utils/discordPresence'
import { ArtistLink } from './components/ArtistLink'
import { EqPlot } from './components/EqPlot'
import { EQ_PRESETS } from './constants/eq'
import { DEFAULT_CONFIG, normalizeEqBands } from './config/defaultConfig'
import {
  normalizeImportedPlaylists,
  buildPlaylistsExportPayload,
  extractDownloadablePlaylists
} from './utils/userPlaylists'
import {
  createEmptySmartCollectionRules,
  normalizeSmartCollectionRules,
  normalizeUserSmartCollections,
  hasActiveSmartCollectionRules,
  matchTrackAgainstSmartCollection
} from './utils/smartCollections'
import {
  inferUiLocaleFromNavigator,
  normalizeUiLocale,
  bcp47ForUiLocale,
  UI_LOCALES
} from './utils/uiLocale'
import { clampBiquadQ } from './utils/eqBiquad'
import { copySongCardImage, saveSongCardImage } from './utils/songCardImage'
import { parseLyricsSourceLink } from './utils/lyricsLink'
import { getDroppedLyricsFile, hasDroppedFiles, readDroppedLyricsFile } from './utils/lyricsDrop'
import PluginSlot from './plugins/PluginSlot'
import PluginManagerDrawer from './components/PluginManagerDrawer'
import { extractAverageHexFromSrc, generatePaletteFromHex } from './utils/color'
import {
  buildLyricsBackgroundPresentation,
  normalizeLyricsBackgroundColor,
  normalizeLyricsBackgroundMode,
  normalizeLyricsBackgroundWallpaperBlur,
  normalizeLyricsBackgroundWallpaperOpacity
} from './utils/lyricsBackground'
import {
  buildArtistBucketsWithAvatars,
  getArtistAvatarRetryAfterMs,
  isTransientArtistAvatarFailure,
  normalizeArtistAvatarSearchResponse,
  isPlatformDefaultArtistAvatarUrl
} from './utils/artistAvatar'
import {
  containsLegacyPlaybackHistoryEntries,
  createPlaybackContext,
  dedupePathList,
  normalizePlaybackContext,
  normalizePlaybackHistory,
  normalizePlaybackHistoryEntry,
  normalizePlaybackSession,
  pickInitialPersistedValue,
  remapPlaybackHistoryEntries
} from '../../shared/playbackPersistence.mjs'
import {
  createPlaybackClockAnchor,
  estimatePlaybackClockPosition
} from '../../shared/playbackClock.mjs'
import { EMBEDDED_LYRICS_EXTRACTOR_VERSION } from '../../shared/embeddedLyricsVersion.mjs'
import { buildLyricKaraokeState } from '../../shared/lyricsKaraoke.mjs'
import { getPlaybackSequencePath, resolvePlaybackSequence } from '../../shared/playbackSequence.mjs'
import { getCueAudioPath } from '../../shared/cueTracks.mjs'
import {
  buildBilibiliAutoMvQueries,
  buildYoutubeAutoMvQueries
} from '../../shared/mvSearchRank.mjs'
import { getAutoMvSearchHit, getBestEffortMvSearchHit } from './utils/mvAutoAccept'
import { orderMvSearchItems } from './utils/mvSearchCandidates'
import {
  isImmersiveLyricsMvEnabled,
  isSideLyricsMvEnabled,
  shouldSearchMvForPlayback,
  shouldLoadMvForSurface
} from './utils/mvVisibility'
import {
  buildAlbumCoverCacheEntries,
  createAlbumCoverCacheKey,
  createAlbumCoverFallbackKey,
  createArtistAvatarCacheKey,
  readAlbumCoverCache,
  readArtistAvatarCache,
  readTrackMetaCache,
  mergeTrackMetaEntryPreservingCover,
  mergeTrackMetaMapPreservingCovers,
  shouldRefreshTrackMetaCacheForAudioQuality,
  writeAlbumCoverCache,
  writeArtistAvatarCache,
  writeTrackMetaCache
} from './utils/trackMetaCache'
import {
  buildRemoteTrackMeta,
  mergeRemoteTrackMeta,
  isRemoteTrackPath,
  isStreamingTrackPath,
  parseStreamingTrackPath,
  isSubsonicTrackPath,
  isWebDavTrackPath
} from './utils/remoteLibrary'

const CJK_FONT_OPTIONS = [
  { key: 'auto', labelKey: 'fontCjkAuto' },
  { key: 'yahei', labelKey: 'fontCjkYahei' },
  { key: 'custom', labelKey: 'fontCustom' }
]

const CJK_FONT_CONFIG_KEYS = new Set([
  ...CJK_FONT_OPTIONS.map((option) => option.key),
  'jhenghei',
  'simsun',
  'simhei',
  'pingfang',
  'noto',
  'sourcehan'
])

function localPathToAudioSrc(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  const audioPath = getCueAudioPath(filePath)
  if (isRemoteTrackPath(audioPath)) return ''
  const href = typeof window !== 'undefined' && window.api?.pathToFileURL?.(audioPath)
  if (href) return href
  return `file://${audioPath}`
}

function isHttpPlaybackStatusPath(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

function nativeStatusPathMatchesActiveTrack(statusPath, activePath) {
  const status = String(statusPath || '')
  const active = String(activePath || '')
  if (!status || !active) return false
  if (status === active) return true
  return isHttpPlaybackStatusPath(status) && isRemoteTrackPath(active)
}

function clampMvMediaTargetTime(media, targetSec) {
  const target = Math.max(0, Number(targetSec) || 0)
  const duration = Number(media?.duration)
  if (!Number.isFinite(duration) || duration <= 0) return target
  return Math.max(0, Math.min(target, Math.max(0, duration - 0.25)))
}

function isMvTargetPastMediaTail(media, targetSec) {
  const target = Number(targetSec)
  const duration = Number(media?.duration)
  return (
    Number.isFinite(target) &&
    Number.isFinite(duration) &&
    duration > 0 &&
    target >= duration - 0.12
  )
}

function pauseMvMediaElement(media) {
  try {
    media?.pause?.()
  } catch {
    /* ignore */
  }
}

function buildPathListFingerprint(paths = []) {
  let hash = 2166136261
  for (let index = 0; index < paths.length; index += 1) {
    const path = String(paths[index] || '')
    hash ^= path.length + index
    hash = Math.imul(hash, 16777619)
    if (path.length > 0) {
      hash ^= path.charCodeAt(0)
      hash = Math.imul(hash, 16777619)
      hash ^= path.charCodeAt(Math.floor(path.length / 2))
      hash = Math.imul(hash, 16777619)
      hash ^= path.charCodeAt(path.length - 1)
      hash = Math.imul(hash, 16777619)
    }
  }
  return `${paths.length}:${(hash >>> 0).toString(36)}`
}

const MENU_ANIM_MS = 160
const GITHUB_RELEASES_API_URL = 'https://api.github.com/repos/Moekotori/Echoes/releases?per_page=6'
const GITHUB_RELEASES_PAGE_URL = 'https://github.com/Moekotori/Echoes/releases'
const RELEASE_NOTES_FETCH_TIMEOUT_MS = 12000
const RELEASE_NOTES_AUTO_RETRY_COOLDOWN_MS = 2 * 60 * 1000
const DEFAULT_PLAYBACK_HISTORY_MAX = 1000
const HISTORY_MAX_ENTRY_OPTIONS = new Set([200, 500, 1000, 5000])
const STORED_VOLUME_KEY = 'nc_volume'
const SIDEBAR_LIST_OVERSCAN = 10
const SIDEBAR_META_PREFETCH_BEHIND_ROWS = 16
const SIDEBAR_META_PREFETCH_AHEAD_ROWS = 72
const ALBUM_META_PREFETCH_BEHIND_ROWS = 4
const ALBUM_META_PREFETCH_AHEAD_ROWS = 24
const SIDEBAR_ROW_HEIGHT = 75
const SIDEBAR_DETAIL_ROW_HEIGHT = 75
const ALBUM_GRID_DEFAULT_ROW_HEIGHT = 68
const ALBUM_GRID_DEFAULT_GAP = 10
const RENDERER_PERSIST_DEBOUNCE_MS = 600
const MV_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const BILI_STREAM_CACHE_TTL_MS = 8 * 60 * 1000
const MV_TRACK_SWITCH_SYNC_COOLDOWN_MS = 900
const MV_DIRECT_FORCE_SEEK_MIN_INTERVAL_MS = 120
const MV_DIRECT_HARD_SEEK_MIN_INTERVAL_MS = 650
const MV_DIRECT_SEEK_REPEAT_EPSILON_SEC = 0.35
const MV_DIRECT_MANUAL_SEEK_THRESHOLD_SEC = 0.12
const MV_DIRECT_AUTO_HARD_SEEK_THRESHOLD_SEC = 1.25
const MV_DIRECT_RATE_NUDGE_THRESHOLD_SEC = 0.2
const MV_DIRECT_DRIFT_TICK_MS = 200
const MV_TRACK_END_SYNC_FREEZE_SEC = 1.2
const MV_NEXT_TRACK_PRELOAD_LEAD_SEC = 20
const PLAYBACK_SESSION_LOCAL_KEY = 'nc_playback_session'
const USER_SMART_COLLECTIONS_LOCAL_KEY = 'nc_user_smart_collections'
const DISPLAY_METADATA_OVERRIDES_LOCAL_KEY = 'nc_display_metadata_overrides'
const MAX_MV_SEARCH_CACHE_ENTRIES = 24
const MAX_BILI_STREAM_CACHE_ENTRIES = 12
const MAX_LRCLIB_CACHE_ENTRIES = 40
const LRCLIB_REQUEST_TIMEOUT_MS = 20000
const STRICT_LYRICS_SOURCE_TIMEOUT_MS = 12000
const LRCLIB_LYRICS_SOURCE_TIMEOUT_MS = LRCLIB_REQUEST_TIMEOUT_MS + 5000
const ONLINE_LYRICS_FALLBACK_RACE_DELAY_MS = 850
const ONLINE_LYRICS_SECOND_FALLBACK_RACE_DELAY_MS = 1700
const MAX_TRACK_META_COVER_ENTRIES = 720
const LIBRARY_META_CACHE_HYDRATE_BATCH_SIZE = 360
const METADATA_PREFETCH_LIMIT = 96
const ALBUM_METADATA_PREFETCH_LIMIT = 240
const STARTUP_IMPORTED_FOLDER_RESCAN_DELAY_MS = 15000
const EMPTY_SET = new Set()
const METADATA_PARSE_BATCH_SIZE = 16
const ALBUM_METADATA_PARSE_BATCH_SIZE = 20
const METADATA_PARSE_WORKERS = 2
const PLAYING_METADATA_PARSE_BATCH_SIZE = 6
const PLAYING_METADATA_PARSE_WORKERS = 1
const ALBUM_CLOUD_COVER_PREFETCH_LIMIT = 40
const ALBUM_CLOUD_COVER_WORKERS = 5
const ARTIST_AVATAR_LOOKUP_VERSION = 6
const ARTIST_AVATAR_PREFETCH_LIMIT = 18
const ARTIST_AVATAR_PREFETCH_WORKERS = 1
const ARTIST_AVATAR_MISS_TTL_MS = 12 * 60 * 60 * 1000
const ARTIST_AVATAR_LOOKUP_GAP_MS = 1200
const ARTIST_AVATAR_PROVIDER_GAP_MS = 350
const ARTIST_AVATAR_TRANSIENT_RETRY_MS = 8 * 60 * 1000
const ARTIST_DETAIL_RETURN_ANIMATION_MS = 120
const MAX_SHARE_CARD_COVER_CHARS = 600000
const ALBUM_COVER_PERSIST_SIGNATURE_LIMIT = 2400
const LYRICS_RENDER_TICK_MS = 80
const ACTIVE_LYRIC_SYNC_TICK_MS = 100
const KARAOKE_RENDER_CONTEXT_LINES = 3
const PLAYBACK_UI_TIME_UPDATE_MS = 1000
const PLAYBACK_UI_TIME_LYRICS_UPDATE_MS = 500
const PLAYBACK_UI_TIME_LIBRARY_BROWSER_UPDATE_MS = 5000
const PLAYBACK_UI_TIME_MINI_PLAYER_UPDATE_MS = 10000
const PLAYBACK_UI_TIME_SEEK_DELTA_SEC = 1.25
const PLAYBACK_SESSION_PLAYING_PERSIST_INTERVAL_MS = 10000
const MINI_PLAYER_PROGRESS_SYNC_BUCKET_SEC = 10
const CLOUD_COVER_RESOLUTION = '600x600bb'
const SIDEBAR_LOGO_IMAGE_SRC = sidebarLogoImage
const BPM_DETECTOR_VERSION = 2
const BPM_DETECTION_START_DELAY_MS = 18000
const MV_SEARCH_PLAYBACK_START_DELAY_MS = 5000

function createSongRandomSortSeed() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(2)
    crypto.getRandomValues(values)
    return `${values[0].toString(36)}-${values[1].toString(36)}`
  }
  return `${Date.now()}-${Math.random()}`
}

function isCastSessionActive(status) {
  return !!(
    status?.castActive ||
    (status?.dlnaEnabled &&
      status?.currentUri &&
      (status.transportState === 'PLAYING' || status.transportState === 'PAUSED_PLAYBACK'))
  )
}

function getCastStatusMeta(status) {
  return status?.castKind === 'airplay'
    ? status?.airplayMeta || {}
    : status?.dlnaMeta || status?.airplayMeta || {}
}

function buildCastVirtualTrack(status) {
  if (!isCastSessionActive(status)) return null
  const kind = status?.castKind || 'cast'
  const meta = getCastStatusMeta(status)
  const title = String(meta?.title || '').trim()
  const artist = String(meta?.artist || '').trim()
  const album = String(meta?.album || '').trim()
  const cover = String(meta?.cover || meta?.albumArtUrl || meta?.artworkUrl || '').trim()
  const metadataTrusted = kind === 'dlna' ? !!title : !!status?.castMetadataTrusted && !!title
  const stableTitle = metadataTrusted ? title : ''
  return {
    path: `cast://${kind}/${encodeURIComponent(stableTitle || status?.currentUri || 'stream')}`,
    title: stableTitle,
    artist,
    album,
    cover,
    source: kind,
    metadataTrusted
  }
}

function normalizeCoverLookupText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function normalizeNeteaseCoverUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return null
  return `${cleanUrl.replace(/\?.*$/, '')}?param=600y600`
}

function normalizeItunesCoverUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return null
  return cleanUrl.replace(/100x100bb(\.[a-z0-9]+)$/i, `${CLOUD_COVER_RESOLUTION}$1`)
}

function normalizeNeteaseArtistImageUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return null
  if (isPlatformDefaultArtistAvatarUrl(cleanUrl)) return null
  return `${cleanUrl.replace(/\?.*$/, '')}?param=600y600`
}

function pickNeteaseArtistImageUrl(candidate) {
  for (const url of [candidate?.picUrl, candidate?.img1v1Url, candidate?.avatar]) {
    const normalized = normalizeNeteaseArtistImageUrl(url)
    if (normalized) return normalized
  }
  return null
}

function normalizeQqMusicArtistImageUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return null
  if (isPlatformDefaultArtistAvatarUrl(cleanUrl)) return null
  return cleanUrl.replace(/T001R\d+x\d+M000/i, 'T001R500x500M000')
}

function cleanupArtistSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^[\s"'“”‘’「」『』【】\[\]()（）]+|[\s"'“”‘’「」『』【】\[\]()（）]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripArtistDecorations(value) {
  return cleanupArtistSearchText(
    String(value || '')
      .replace(/[（(［\[]\s*(?:cv|cv\.|voice|vo|歌|唱|feat|featuring)[^）)\]］]*[）)\]］]/gi, '')
      .replace(/[（(［\[][^）)\]］]{1,32}[）)\]］]/g, '')
      .replace(/\b(?:feat|ft|featuring)\.?\b.*$/i, '')
  )
}

function buildArtistAvatarSearchQueries(artistName) {
  const raw = cleanupArtistSearchText(artistName)
  if (!raw) return []

  const queries = []
  const push = (value) => {
    const next = cleanupArtistSearchText(value)
    if (!next) return
    const normalized = normalizeCoverLookupText(next)
    if (!normalized) return
    if (queries.some((item) => normalizeCoverLookupText(item) === normalized)) return
    queries.push(next)
  }

  push(raw)
  push(stripArtistDecorations(raw))

  for (const match of raw.matchAll(/[（(［\[]([^）)\]］]{1,48})[）)\]］]/g)) {
    const inner = cleanupArtistSearchText(
      match[1].replace(/^(?:cv|cv\.|voice|vo|歌|唱)\s*[:：]?\s*/i, '')
    )
    push(inner)
  }

  const base = stripArtistDecorations(raw) || raw
  for (const part of base.split(/\s*(?:\/|／|,|，|、|;|；|\+|＋|&|＆|×|x|X|・|·|\|)\s*/)) {
    push(part)
  }

  return queries.slice(0, 6)
}

function pickBestArtistAvatarCandidate(candidates, artistName, query = artistName) {
  const wantedArtist = normalizeCoverLookupText(artistName)
  const wantedQuery = normalizeCoverLookupText(query)
  if ((!wantedArtist && !wantedQuery) || !Array.isArray(candidates)) return null

  let best = null
  for (const candidate of candidates) {
    const candidateName = normalizeCoverLookupText(candidate?.name)
    const aliasTokens = Array.isArray(candidate?.alias)
      ? candidate.alias.map(normalizeCoverLookupText).filter(Boolean)
      : []
    const imageUrl = candidate?.picUrl || candidate?.img1v1Url
    if (!imageUrl) continue

    let score = 0
    if (candidateName === wantedArtist || candidateName === wantedQuery) score += 130
    else if (aliasTokens.includes(wantedArtist) || aliasTokens.includes(wantedQuery)) score += 105
    else if (
      (wantedQuery &&
        (candidateName.includes(wantedQuery) || wantedQuery.includes(candidateName))) ||
      (wantedArtist &&
        (candidateName.includes(wantedArtist) || wantedArtist.includes(candidateName)))
    ) {
      score += 52
    } else score -= 60
    if (candidate?.source === 'qq') score += 4
    score += Math.min(20, Number(candidate?.musicSize || 0) / 10)
    score += Math.min(10, Number(candidate?.albumSize || 0) / 5)

    if (!best || score > best.score) {
      best = { candidate, score }
    }
  }

  return best && best.score > 0 ? best.candidate : null
}

function scoreCoverCandidate(candidate, title, artist, album) {
  const wantedTitle = normalizeCoverLookupText(title)
  const wantedArtist = normalizeCoverLookupText(artist)
  const wantedAlbum = normalizeCoverLookupText(album)
  const candidateTitle = normalizeCoverLookupText(candidate?.name)
  const candidateArtist = normalizeCoverLookupText(candidate?.artists || candidate?.artist)
  const candidateAlbum = normalizeCoverLookupText(candidate?.album)

  if (!wantedTitle || !candidateTitle) return 0
  if (
    candidateTitle !== wantedTitle &&
    !candidateTitle.includes(wantedTitle) &&
    !wantedTitle.includes(candidateTitle)
  ) {
    return 0
  }

  let score = candidateTitle === wantedTitle ? 8 : 5
  if (wantedArtist && candidateArtist) {
    if (candidateArtist === wantedArtist) score += 4
    else if (candidateArtist.includes(wantedArtist) || wantedArtist.includes(candidateArtist))
      score += 2
  }
  if (wantedAlbum && candidateAlbum) {
    if (candidateAlbum === wantedAlbum) score += 3
    else if (candidateAlbum.includes(wantedAlbum) || wantedAlbum.includes(candidateAlbum))
      score += 1
  }
  return score
}

function pickBestCoverCandidate(items, title, artist, album) {
  return (items || [])
    .filter((item) => item?.cover || item?.picUrl)
    .map((item) => ({ item, score: scoreCoverCandidate(item, title, artist, album) }))
    .filter((entry) => entry.score >= 5)
    .sort((a, b) => b.score - a.score)[0]?.item
}

function pickBestAlbumCoverCandidate(items, album, artist) {
  const wantedAlbum = normalizeCoverLookupText(album)
  const wantedArtist = normalizeCoverLookupText(artist)
  if (!wantedAlbum) return null

  return (items || [])
    .filter((item) => item?.picUrl || item?.cover || item?.artworkUrl100)
    .map((item) => {
      const candidateAlbum = normalizeCoverLookupText(
        item?.name || item?.album || item?.collectionName
      )
      const candidateArtist = normalizeCoverLookupText(
        item?.artist || item?.artists || item?.artistName
      )
      if (
        !candidateAlbum ||
        (candidateAlbum !== wantedAlbum &&
          !candidateAlbum.includes(wantedAlbum) &&
          !wantedAlbum.includes(candidateAlbum))
      ) {
        return { item, score: 0 }
      }

      let score = candidateAlbum === wantedAlbum ? 8 : 5
      if (wantedArtist && candidateArtist) {
        if (candidateArtist === wantedArtist) score += 4
        else if (candidateArtist.includes(wantedArtist) || wantedArtist.includes(candidateArtist)) {
          score += 2
        }
      }
      return { item, score }
    })
    .filter((entry) => entry.score >= 5)
    .sort((a, b) => b.score - a.score)[0]?.item
}

function getInitialAppStateValue(key) {
  try {
    if (typeof window === 'undefined' || !window.api?.getInitialAppStateValue) return null
    return window.api.getInitialAppStateValue(key)
  } catch {
    return null
  }
}

function readStoredJson(localKey) {
  try {
    const raw = localStorage.getItem(localKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizeUpNextQueue(value) {
  if (!Array.isArray(value)) return undefined
  const seen = new Set()
  const next = []
  for (const entry of value) {
    const path =
      typeof entry === 'string' ? entry : entry && typeof entry.path === 'string' ? entry.path : ''
    if (!path || seen.has(path)) continue
    seen.add(path)
    next.push({ path })
  }
  return next
}

function queueDragTransformToString(transform) {
  if (!transform) return undefined
  const x = Number.isFinite(transform.x) ? transform.x : 0
  const y = Number.isFinite(transform.y) ? transform.y : 0
  const scaleX = Number.isFinite(transform.scaleX) ? transform.scaleX : 1
  const scaleY = Number.isFinite(transform.scaleY) ? transform.scaleY : 1
  return `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY})`
}

function getPathBasename(filePath) {
  return (
    String(filePath || '')
      .split(/[\\/]/)
      .pop() || ''
  )
}

function getPathDirname(filePath) {
  const normalized = String(filePath || '')
  const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

function isAbsolutePlaylistPath(value) {
  const path = String(value || '').trim()
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith('\\\\') ||
    path.startsWith('/') ||
    /^https?:\/\//i.test(path)
  )
}

function resolvePlaylistEntryPath(entry, playlistFilePath) {
  const raw = String(entry || '').trim()
  if (!raw) return ''
  if (/^file:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const decoded = decodeURIComponent(url.pathname || '')
      if (url.host) return `\\\\${url.host}${decoded.replace(/\//g, '\\')}`
      return decoded.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
    } catch {
      return raw
    }
  }
  if (isAbsolutePlaylistPath(raw)) return raw
  const baseDir = getPathDirname(playlistFilePath)
  if (!baseDir) return raw
  const separator = baseDir.includes('\\') ? '\\' : '/'
  return `${baseDir.replace(/[\\/]+$/, '')}${separator}${raw.replace(/^[\\/]+/, '')}`
}

function parseM3UPlaylist(content, filePath) {
  const paths = []
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    paths.push(resolvePlaylistEntryPath(line, filePath))
  }
  return [...new Set(paths.filter(Boolean))]
}

const UpNextQueueSortableItem = memo(function UpNextQueueSortableItem({
  item,
  index,
  albumArtistByName,
  onRemove,
  removeButtonTitle
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.path
  })
  const displayArtist =
    item.track.info.artist === 'Unknown Artist'
      ? albumArtistByName[item.track.info.album] || item.track.info.artist
      : item.track.info.artist

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: queueDragTransformToString(transform),
        transition
      }}
      className={`queue-preview-item${isDragging ? ' queue-preview-item--dragging' : ''}`}
    >
      <button
        type="button"
        className="queue-preview-handle"
        aria-label="Reorder queue item"
        title="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className="queue-preview-index">{index + 1}.</span>
      <span className="queue-preview-text" title={`${item.track.info.title} - ${displayArtist}`}>
        {item.track.info.title} - {displayArtist}
      </span>
      <button
        type="button"
        className="queue-preview-remove"
        onClick={() => onRemove(item.path)}
        title={removeButtonTitle}
      >
        <Minus size={14} />
      </button>
    </div>
  )
})

function normalizeDisplayMetadataOverrides(value) {
  if (!value || typeof value !== 'object') return {}
  const next = {}
  for (const [path, item] of Object.entries(value)) {
    if (typeof path !== 'string' || !path || !item || typeof item !== 'object') continue
    const normalizedItem = {}
    for (const key of ['title', 'artist', 'album', 'albumArtist', 'cover', 'coverPath']) {
      if (typeof item[key] === 'string') normalizedItem[key] = item[key]
    }
    for (const key of ['trackNo', 'discNo']) {
      const raw = item[key]
      const parsed = Number.parseInt(String(raw ?? ''), 10)
      if (Number.isFinite(parsed) && parsed > 0) normalizedItem[key] = parsed
    }
    if (Object.keys(normalizedItem).length > 0) next[path] = normalizedItem
  }
  return next
}

function trimTrackMetaCoverEntries(
  metaMap,
  keepPaths = new Set(),
  maxEntries = MAX_TRACK_META_COVER_ENTRIES
) {
  if (!metaMap || typeof metaMap !== 'object') return metaMap
  const coverEntries = Object.entries(metaMap).filter(([, entry]) => {
    return typeof entry?.cover === 'string' && entry.cover
  })
  if (coverEntries.length <= maxEntries) return metaMap

  const protectedPaths = keepPaths instanceof Set ? keepPaths : new Set()
  const removableEntries = coverEntries.filter(([path]) => !protectedPaths.has(path))
  const removeCount = Math.min(removableEntries.length, coverEntries.length - maxEntries)
  if (removeCount <= 0) return metaMap

  const next = { ...metaMap }
  for (const [path, entry] of removableEntries.slice(0, removeCount)) {
    next[path] = {
      ...entry,
      cover: null,
      coverChecked: true,
      coverMemoryTrimmed: true
    }
  }
  return next
}

function normalizeReleaseVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
}

function buildReleasePreviewLines(body) {
  return String(body || '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s*/, '')
        .trim()
    )
    .filter(Boolean)
    .slice(0, 8)
}

function clampVolume(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 1
  return Math.min(1, Math.max(0, num))
}

function normalizeUnitOpacity(value, fallback = 1) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.endsWith('%')) {
      const percent = Number(text.slice(0, -1))
      if (Number.isFinite(percent)) return Math.min(1, Math.max(0, percent / 100))
    }
  }
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(1, Math.max(0, num))
}

function sanitizeCoverForPhoneRemote(value) {
  const text = String(value || '').trim()
  if (/^data:image\//i.test(text)) return text
  if (/^https?:\/\//i.test(text)) return text
  return ''
}

function makePhoneRemoteTrackId(path) {
  const text = String(path || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `tr_${(hash >>> 0).toString(36)}_${text.length.toString(36)}`
}

function buildPhoneRemoteTrackPayload(track, meta, id, extra = {}) {
  if (!track?.path) return null
  const info = parseTrackInfo(track, meta)
  const fallbackName = stripExtension(track.name || fileNameFromPath(track.path))
  const title = info?.title || track?.info?.title || fallbackName || 'Unknown Track'
  const artist =
    (info?.artist && info.artist !== 'Unknown Artist' ? info.artist : '') ||
    (track?.info?.artist && track.info.artist !== 'Unknown Artist' ? track.info.artist : '') ||
    ''
  const album =
    (info?.album && info.album !== 'Unknown Album' ? info.album : '') ||
    (track?.info?.album && track.info.album !== 'Unknown Album' ? track.info.album : '') ||
    ''
  const durationValue =
    Number(meta?.duration) ||
    Number(info?.duration) ||
    Number(track?.duration) ||
    Number(track?.info?.duration) ||
    0
  const bitrateKbps =
    Number(meta?.bitrateKbps) ||
    (Number(meta?.bitrate) ? Math.round(Number(meta.bitrate) / 1000) : 0)
  return {
    id,
    title,
    artist,
    album,
    cover: sanitizeCoverForPhoneRemote(
      extra.cover ?? meta?.cover ?? info?.cover ?? track?.cover ?? track?.info?.cover ?? ''
    ),
    duration: Number.isFinite(durationValue) ? durationValue : 0,
    codec: String(meta?.codec || track?.codec || track?.format || '').toUpperCase(),
    sampleRateHz: Number(meta?.sampleRateHz || meta?.sampleRate || 0) || 0,
    bitDepth: Number(meta?.bitDepth || 0) || 0,
    bitrateKbps: Number.isFinite(bitrateKbps) ? bitrateKbps : 0,
    ...extra
  }
}

function resolveContextMenuPoint(eventLike, fallbackElement = null) {
  const event = eventLike || null
  const currentTarget = event?.currentTarget || fallbackElement || null
  const rect =
    currentTarget && typeof currentTarget.getBoundingClientRect === 'function'
      ? currentTarget.getBoundingClientRect()
      : null
  const clientX = Number.isFinite(event?.clientX)
    ? event.clientX
    : rect
      ? rect.left + Math.min(rect.width / 2, 24)
      : 24
  const clientY = Number.isFinite(event?.clientY)
    ? event.clientY
    : rect
      ? rect.top + Math.min(rect.height / 2, 24)
      : 24
  return { clientX, clientY }
}

const EDITABLE_SHORTCUT_INPUT_TYPES = new Set([
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week'
])

function isEditableShortcutTarget(target) {
  const element = target?.nodeType === 1 ? target : null
  if (!element) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  const role = typeof element.getAttribute === 'function' ? element.getAttribute('role') : ''
  if (role === 'textbox' || role === 'searchbox') {
    return true
  }

  const tagName = element.tagName?.toLowerCase()
  if (tagName === 'textarea') {
    return true
  }
  if (tagName !== 'input') {
    return false
  }

  const inputType = String(element.getAttribute('type') || 'text').toLowerCase()
  return EDITABLE_SHORTCUT_INPUT_TYPES.has(inputType)
}

function readStoredVolume() {
  try {
    const saved = getInitialAppStateValue('volume')
    if (typeof saved === 'number' && Number.isFinite(saved)) return clampVolume(saved)
    const localSaved = localStorage.getItem(STORED_VOLUME_KEY)
    if (localSaved == null) return 1
    return clampVolume(localSaved)
  } catch {
    return 1
  }
}

function isLocalAudioFilePath(p) {
  if (!p || typeof p !== 'string') return false
  const t = p.trim()
  if (!t) return false
  if (/^https?:\/\//i.test(t)) return false
  if (t.startsWith('\\\\')) return true
  if (/^[a-zA-Z]:[\\/]/.test(t)) return true
  if (t.startsWith('/')) return true
  return false
}

function fileNameFromPath(filePath = '') {
  return (
    String(filePath || '')
      .split(/[/\\]/)
      .pop() || String(filePath || '')
  )
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildPlaybackHistoryEntry(track, trackMetaMap, playedAt = Date.now()) {
  if (!track?.path) return null
  const info = parseTrackInfo(track, trackMetaMap?.[track.path])
  return {
    path: track.path,
    title: info?.title || stripExtension(track.name || fileNameFromPath(track.path)),
    artist:
      info?.artist && info.artist !== 'Unknown Artist'
        ? info.artist
        : track?.info?.artist && track.info.artist !== 'Unknown Artist'
          ? track.info.artist
          : '',
    album:
      info?.album && info.album !== 'Unknown Album'
        ? info.album
        : track?.info?.album && track.info.album !== 'Unknown Album'
          ? track.info.album
          : '',
    playedAt
  }
}

function normalizeHistoryMaxEntries(value) {
  if (value === Infinity || value === 'Infinity' || value === 'unlimited') return Infinity
  const numeric = Number(value)
  if (HISTORY_MAX_ENTRY_OPTIONS.has(numeric)) return numeric
  return DEFAULT_PLAYBACK_HISTORY_MAX
}

function trimPlaybackHistoryEntries(entries, maxEntries = DEFAULT_PLAYBACK_HISTORY_MAX) {
  const normalizedMax = normalizeHistoryMaxEntries(maxEntries)
  const normalized = Array.isArray(entries)
    ? normalizePlaybackHistory(entries, Number.MAX_SAFE_INTEGER)
    : []
  return normalizedMax === Infinity ? normalized : normalized.slice(-normalizedMax)
}

function collapseConsecutiveHistoryEntries(entries) {
  const source = Array.isArray(entries) ? entries : []
  const next = []
  for (const entry of source) {
    const normalizedEntry = normalizePlaybackHistoryEntry(entry)
    if (!normalizedEntry) continue
    const previous = next[next.length - 1]
    if (previous?.path === normalizedEntry.path) {
      next[next.length - 1] = {
        ...previous,
        ...normalizedEntry,
        playedAt: Math.max(Number(previous.playedAt) || 0, Number(normalizedEntry.playedAt) || 0)
      }
    } else {
      next.push(normalizedEntry)
    }
  }
  return next
}

function getHistoryBucket(playedAt, now = Date.now()) {
  const time = Number(playedAt) || 0
  if (!time) return 'earlier'
  const date = new Date(time)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  if (time >= startOfToday) return 'today'
  if (time >= startOfYesterday) return 'yesterday'
  if (time >= startOfWeek) return 'thisWeek'
  if (time >= startOfMonth) return 'thisMonth'
  return 'earlier'
}

function formatHistoryClock(playedAt) {
  const date = new Date(Number(playedAt) || Date.now())
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildHistoryRelativeTime(playedAt, t, now = Date.now()) {
  const time = Number(playedAt) || 0
  if (!time) return ''
  const deltaMs = Math.max(0, now - time)
  const minute = 60 * 1000
  const hour = 60 * minute
  if (deltaMs < minute) return t('history.relative.justNow', 'Just now')
  if (deltaMs < hour) {
    return t('history.relative.minutesAgo', {
      count: Math.max(1, Math.floor(deltaMs / minute)),
      defaultValue: '{{count}} min ago'
    })
  }
  if (deltaMs < 6 * hour) {
    return t('history.relative.hoursAgo', {
      count: Math.max(1, Math.floor(deltaMs / hour)),
      defaultValue: '{{count}} hr ago'
    })
  }
  const bucket = getHistoryBucket(time, now)
  const clock = formatHistoryClock(time)
  if (bucket === 'today') {
    return t('history.relative.todayAt', { time: clock, defaultValue: 'Today {{time}}' })
  }
  if (bucket === 'yesterday') {
    return t('history.relative.yesterdayAt', {
      time: clock,
      defaultValue: 'Yesterday {{time}}'
    })
  }
  return new Date(time).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  })
}

function normalizeConfigState(raw) {
  const source = raw && typeof raw === 'object' ? raw : null
  if (!source) {
    return { ...DEFAULT_CONFIG, uiLocale: inferUiLocaleFromNavigator() }
  }

  const oldRev = source.configRevision ?? 0
  const appRev = DEFAULT_CONFIG.configRevision ?? 1
  const merged = {
    ...DEFAULT_CONFIG,
    ...source,
    customColors: normalizeThemeColors({
      ...DEFAULT_CONFIG.customColors,
      ...(source.customColors || {})
    })
  }
  delete merged.showVisualizer
  delete merged.showMiniWaveform
  delete merged.visualizerStyle
  if (!Object.prototype.hasOwnProperty.call(source, 'lyricsShowRomaji')) {
    merged.lyricsShowRomaji = DEFAULT_CONFIG.lyricsShowRomaji
  }
  if (!Object.prototype.hasOwnProperty.call(source, 'lyricsShowTranslation')) {
    merged.lyricsShowTranslation = DEFAULT_CONFIG.lyricsShowTranslation
  }
  if (!Object.prototype.hasOwnProperty.call(source, 'lyricsWordHighlight')) {
    merged.lyricsWordHighlight = DEFAULT_CONFIG.lyricsWordHighlight
  }
  if (typeof merged.lyricsReadabilityEnhancement !== 'boolean') {
    merged.lyricsReadabilityEnhancement = DEFAULT_CONFIG.lyricsReadabilityEnhancement
  }
  if (!['embedded', 'lrc'].includes(merged.localLyricsPriority)) {
    merged.localLyricsPriority = DEFAULT_CONFIG.localLyricsPriority
  }
  if (
    ![
      'local',
      'lrclib',
      'netease',
      'qq',
      'kugou',
      'kuwo'
    ].includes(merged.lyricsSource)
  ) {
    merged.lyricsSource = DEFAULT_CONFIG.lyricsSource
  }
  merged.lyricsBackgroundMode = normalizeLyricsBackgroundMode(merged.lyricsBackgroundMode)
  merged.lyricsBackgroundColor = normalizeLyricsBackgroundColor(
    merged.lyricsBackgroundColor,
    DEFAULT_CONFIG.lyricsBackgroundColor
  )
  if (typeof merged.lyricsBackgroundWallpaperPath !== 'string') {
    merged.lyricsBackgroundWallpaperPath = DEFAULT_CONFIG.lyricsBackgroundWallpaperPath
  }
  merged.lyricsBackgroundWallpaperOpacity = normalizeLyricsBackgroundWallpaperOpacity(
    merged.lyricsBackgroundWallpaperOpacity,
    DEFAULT_CONFIG.lyricsBackgroundWallpaperOpacity
  )
  if (Math.abs(merged.lyricsBackgroundWallpaperOpacity - 0.72) < 0.001) {
    merged.lyricsBackgroundWallpaperOpacity = DEFAULT_CONFIG.lyricsBackgroundWallpaperOpacity
  }
  merged.lyricsBackgroundWallpaperBlur = normalizeLyricsBackgroundWallpaperBlur(
    merged.lyricsBackgroundWallpaperBlur,
    DEFAULT_CONFIG.lyricsBackgroundWallpaperBlur
  )
  if (typeof merged.lyricsDeepSearchEnabled !== 'boolean') {
    merged.lyricsDeepSearchEnabled = DEFAULT_CONFIG.lyricsDeepSearchEnabled
  }
  if (!Object.prototype.hasOwnProperty.call(source, 'uiLocale')) {
    merged.uiLocale = inferUiLocaleFromNavigator()
  } else {
    merged.uiLocale = normalizeUiLocale(merged.uiLocale)
  }
  if (merged.closeButtonBehavior !== 'quit' && merged.closeButtonBehavior !== 'tray') {
    merged.closeButtonBehavior = DEFAULT_CONFIG.closeButtonBehavior
  }
  if (!['time', 'track'].includes(merged.sleepTimerMode)) {
    merged.sleepTimerMode = DEFAULT_CONFIG.sleepTimerMode
  }
  if (typeof merged.crossfadeEnabled !== 'boolean') {
    merged.crossfadeEnabled = DEFAULT_CONFIG.crossfadeEnabled
  }
  if (
    !Number.isFinite(merged.crossfadeDuration) ||
    merged.crossfadeDuration < 1 ||
    merged.crossfadeDuration > 12
  ) {
    merged.crossfadeDuration = DEFAULT_CONFIG.crossfadeDuration
  }
  merged.sleepTimerMinutes = normalizeSleepTimerMinutes(merged.sleepTimerMinutes)
  if (typeof merged.sleepTimerEnabled !== 'boolean') {
    merged.sleepTimerEnabled = DEFAULT_CONFIG.sleepTimerEnabled
  }
  if (typeof merged.phoneRemoteEnabled !== 'boolean') {
    merged.phoneRemoteEnabled = DEFAULT_CONFIG.phoneRemoteEnabled
  }
  if (typeof merged.miniPlayerAlwaysOnTop !== 'boolean') {
    merged.miniPlayerAlwaysOnTop = DEFAULT_CONFIG.miniPlayerAlwaysOnTop
  }
  if (typeof merged.miniPlayerAutoHideMainWindow !== 'boolean') {
    merged.miniPlayerAutoHideMainWindow = DEFAULT_CONFIG.miniPlayerAutoHideMainWindow
  }
  if (typeof merged.showSidebarLogo !== 'boolean') {
    merged.showSidebarLogo = DEFAULT_CONFIG.showSidebarLogo
  }
  if (typeof merged.autoLocateCurrentTrack !== 'boolean') {
    merged.autoLocateCurrentTrack = DEFAULT_CONFIG.autoLocateCurrentTrack
  }
  if (typeof merged.ultraSmallScreenAdaptive !== 'boolean') {
    merged.ultraSmallScreenAdaptive = DEFAULT_CONFIG.ultraSmallScreenAdaptive
  }
  if (typeof merged.showTitlebarCastSender !== 'boolean') {
    merged.showTitlebarCastSender = DEFAULT_CONFIG.showTitlebarCastSender
  }
  if (typeof merged.showTitlebarListenTogether !== 'boolean') {
    merged.showTitlebarListenTogether = DEFAULT_CONFIG.showTitlebarListenTogether
  }
  if (typeof merged.showTitlebarPlugins !== 'boolean') {
    merged.showTitlebarPlugins = DEFAULT_CONFIG.showTitlebarPlugins
  }
  if (typeof merged.autoSearchMV !== 'boolean') {
    merged.autoSearchMV = DEFAULT_CONFIG.autoSearchMV
  }
  if (typeof merged.preloadMV !== 'boolean') {
    merged.preloadMV = DEFAULT_CONFIG.preloadMV
  }
  if (typeof merged.restartMusicOnMvLoad !== 'boolean') {
    merged.restartMusicOnMvLoad = DEFAULT_CONFIG.restartMusicOnMvLoad
  }
  if (typeof merged.enableMV !== 'boolean') {
    merged.enableMV = DEFAULT_CONFIG.enableMV
  }
  if (typeof merged.mvAsBackground !== 'boolean') {
    merged.mvAsBackground = DEFAULT_CONFIG.mvAsBackground
  }
  if (typeof merged.mvAsBackgroundMain !== 'boolean') {
    merged.mvAsBackgroundMain = DEFAULT_CONFIG.mvAsBackgroundMain
  }
  if (!merged.enableMV) {
    merged.mvAsBackground = false
  }
  if (!CJK_FONT_CONFIG_KEYS.has(merged.uiCjkFontFamily)) {
    merged.uiCjkFontFamily = DEFAULT_CONFIG.uiCjkFontFamily
  }
  if (merged.uiCjkFontFamily !== 'custom') {
    merged.uiCjkCustomFontPath = null
  }
  merged.historyMaxEntries = normalizeHistoryMaxEntries(merged.historyMaxEntries)
  if (typeof merged.historyCollapseRepeats !== 'boolean') {
    merged.historyCollapseRepeats = DEFAULT_CONFIG.historyCollapseRepeats
  }
  if (typeof merged.historyShowInSidebar !== 'boolean') {
    merged.historyShowInSidebar = DEFAULT_CONFIG.historyShowInSidebar
  }
  if (oldRev < appRev) {
    merged.configRevision = appRev
  }
  merged.eqBands = normalizeEqBands(source.eqBands ?? merged.eqBands)
  if (!['off', '2x', '4x'].includes(merged.eqOversampling)) {
    merged.eqOversampling = DEFAULT_CONFIG.eqOversampling
  }
  if (!['soft', 'hard', 'off'].includes(merged.eqOutputSafety)) {
    merged.eqOutputSafety = DEFAULT_CONFIG.eqOutputSafety
  }
  if (!['low', 'balanced', 'stable'].includes(merged.audioOutputBufferProfile)) {
    merged.audioOutputBufferProfile = 'balanced'
  }
  if (
    merged.theme !== 'custom' &&
    !Object.prototype.hasOwnProperty.call(PRESET_THEMES, merged.theme)
  ) {
    merged.theme = 'minimal'
    merged.customColors = normalizeThemeColors(PRESET_THEMES.minimal.colors)
  }
  merged.uiAccentBackgroundGlow = false
  if (oldRev < 4) {
    const legacy = merged.lyricsFontColor
    if (!merged.lyricsColor && typeof legacy === 'string' && legacy.trim()) {
      const hex = legacy.trim()
      merged.lyricsColor = {
        version: 1,
        layers: {
          main: {
            active: { hex, a: 1 },
            normal: { hex, a: 0.82 },
            past: { hex, a: 0.6 }
          }
        }
      }
    }
  }
  return merged
}

const SLEEP_TIMER_MINUTES_MIN = 1
const SLEEP_TIMER_MINUTES_MAX = 999

function normalizeSleepTimerMinutes(value, fallback = DEFAULT_CONFIG.sleepTimerMinutes) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return fallback
  return Math.max(SLEEP_TIMER_MINUTES_MIN, Math.min(SLEEP_TIMER_MINUTES_MAX, Math.round(minutes)))
}
const SETTINGS_SECTION_KEYWORDS = {
  language: [
    'language',
    'locale',
    'window',
    'close',
    'button',
    'behavior',
    'tray',
    'quit',
    'close button behavior',
    '\u8bed\u8a00',
    '\u7a97\u53e3',
    '\u5173\u95ed',
    '\u6309\u94ae',
    '\u884c\u4e3a',
    '\u6258\u76d8',
    '\u9000\u51fa',
    '\u5173\u95ed\u6309\u94ae\u884c\u4e3a',
    'en',
    'zh',
    'ja',
    '\u8a00\u8a9e',
    '\u95dc\u9589',
    '\u6309\u9215',
    '\u884c\u70ba',
    '\u7cfb\u7d71\u5323',
    '\u7d50\u675f',
    '\u9589\u3058\u308b',
    '\u30dc\u30bf\u30f3',
    '\u52d5\u4f5c'
  ],
  engine: [
    'visualizer',
    'spectrum',
    'waveform',
    'eq',
    'equalizer',
    'buffer',
    'crossfade',
    'automix',
    'behavior',
    'locate',
    'current',
    'playing',
    'sleep',
    'timer',
    'asio',
    'exclusive',
    'audio',
    '\u5747\u8861',
    '\u97f3\u9891',
    '\u6de1\u5165\u6de1\u51fa',
    '\u884c\u4e3a',
    '\u5b9a\u4f4d',
    '\u5f53\u524d\u64ad\u653e',
    '\u7761\u7720',
    '\u5b9a\u65f6',
    '\u30a4\u30b3\u30e9\u30a4\u30b6\u30fc',
    '\u52d5\u4f5c',
    '\u30af\u30ed\u30b9\u30d5\u30a7\u30fc\u30c9'
  ],
  integrations: [
    'account',
    'accounts',
    'login',
    'sign in',
    'signin',
    'cookie',
    'youtube',
    'bilibili',
    'netease',
    'qq music',
    'discord',
    'rpc',
    'presence',
    'phone',
    'remote',
    'wifi',
    '\u624b\u673a',
    '\u9065\u63a7',
    '\u8d26\u53f7',
    '\u767b\u5f55',
    '\u7f51\u6613\u4e91',
    'qq\u97f3\u4e50',
    '\u54d4\u54e9\u54d4\u54e9',
    '\u96c6\u6210',
    '\u6574\u5408',
    '\u9023\u643a'
  ],
  remoteLibrary: [
    'navidrome',
    'subsonic',
    'webdav',
    'alist',
    'nas',
    'remote',
    'server',
    'library',
    '\u7f51\u76d8',
    '\u7f51\u7edc\u786c\u76d8',
    '\u8fdc\u7a0b',
    '\u4e91\u7aef',
    '\u670d\u52a1\u5668',
    '\u66f2\u5e93'
  ],
  eq: [
    'eq',
    'equalizer',
    'parametric',
    'preamp',
    'band',
    '\u5747\u8861\u5668',
    '\u53c2\u91cf',
    '\u30a4\u30b3\u30e9\u30a4\u30b6\u30fc'
  ],
  aesthetics: [
    'theme',
    'color',
    'background',
    'blur',
    'font',
    'radius',
    'opacity',
    'gradient',
    'logo',
    'sidebar',
    '\u4e3b\u9898',
    '\u989c\u8272',
    '\u80cc\u666f',
    '\u5b57\u4f53',
    '\u6a21\u7cca',
    '\u6807\u5fd7',
    '\u4fa7\u8fb9\u680f',
    '\u30c6\u30fc\u30de',
    '\u30d5\u30a9\u30f3\u30c8',
    '\u30ed\u30b4',
    '\u30b5\u30a4\u30c9\u30d0\u30fc'
  ],
  media: [
    'download',
    'library',
    'playlist',
    'folder',
    'import',
    'cleanup',
    '\u4e0b\u8f7d',
    '\u5a92\u4f53\u5e93',
    '\u6b4c\u5355',
    '\u5bfc\u5165',
    '\u6e05\u7406',
    '\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9',
    '\u30e9\u30a4\u30d6\u30e9\u30ea',
    '\u30d7\u30ec\u30a4\u30ea\u30b9\u30c8'
  ],
  about: [
    'about',
    'version',
    'update',
    'release',
    'changelog',
    'developer',
    'devtools',
    '\u5173\u4e8e',
    '\u7248\u672c',
    '\u66f4\u65b0',
    '\u5f00\u53d1',
    '\u30d0\u30fc\u30b8\u30e7\u30f3',
    '\u30a2\u30c3\u30d7\u30c7\u30fc\u30c8',
    '\u958b\u767a'
  ],
  danger: ['reset', 'danger', 'clear', '\u91cd\u7f6e', '\u5371\u9669', '\u30ea\u30bb\u30c3\u30c8'],
  lastfm: [
    'last.fm',
    'lastfm',
    'scrobble',
    'scrobbling',
    '\u6b4c\u66f2\u8bb0\u5f55',
    '\u542c\u6b4c\u5386\u53f2',
    '\u6b4c\u66f2\u5206\u4eab',
    '\u30b9\u30af\u30ed\u30d6\u30eb'
  ]
}

function formatSleepTimerRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function normalizeWatchedTrack(track) {
  if (!track?.path) return null
  return {
    name: track.name || fileNameFromPath(track.path),
    path: track.path,
    folder: track.folder,
    birthtimeMs: track.birthtimeMs || 0,
    mtimeMs: track.mtimeMs || 0,
    sizeBytes: track.sizeBytes || 0
  }
}

function remapPathList(paths, pathMap, removedSet) {
  const seen = new Set()
  const next = []
  for (const path of Array.isArray(paths) ? paths : []) {
    if (typeof path !== 'string' || !path) continue
    const mappedPath = pathMap[path] || path
    if (!mappedPath || removedSet.has(mappedPath) || seen.has(mappedPath)) continue
    seen.add(mappedPath)
    next.push(mappedPath)
  }
  return next
}

function remapQueueItems(items, pathMap, removedSet) {
  const seen = new Set()
  const next = []
  for (const item of Array.isArray(items) ? items : []) {
    const path = item?.path
    if (typeof path !== 'string' || !path) continue
    const mappedPath = pathMap[path] || path
    if (!mappedPath || removedSet.has(mappedPath) || seen.has(mappedPath)) continue
    seen.add(mappedPath)
    next.push({ path: mappedPath })
  }
  return next
}

function remapTrackMetaEntries(metaMap, pathMap, removedSet) {
  const next = {}
  for (const [path, value] of Object.entries(metaMap || {})) {
    const mappedPath = pathMap[path] || path
    if (!mappedPath || removedSet.has(mappedPath)) continue
    if (!Object.prototype.hasOwnProperty.call(next, mappedPath)) {
      next[mappedPath] = value
    }
  }
  return next
}

function remapTrackStatsEntries(statsMap, pathMap, removedSet) {
  const next = {}
  for (const [path, value] of Object.entries(statsMap || {})) {
    const mappedPath = pathMap[path] || path
    if (!mappedPath || removedSet.has(mappedPath)) continue
    if (!Object.prototype.hasOwnProperty.call(next, mappedPath)) {
      next[mappedPath] = value
    }
  }
  return next
}

function withUpdatedTrackPath(track, nextPath) {
  if (!track?.path || !nextPath || track.path === nextPath) return track
  return {
    ...track,
    path: nextPath,
    name: fileNameFromPath(nextPath)
  }
}

function isTrackInsideImportedFolders(trackPath, folders) {
  if (!trackPath || !Array.isArray(folders) || !folders.length) return false
  const normalizedPath = String(trackPath).replace(/\\/g, '/').toLowerCase()
  return folders.some((folder) => {
    const normalizedFolder = String(folder || '')
      .replace(/[\\/]+$/, '')
      .replace(/\\/g, '/')
      .toLowerCase()
    if (!normalizedFolder) return false
    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`)
  })
}

function normalizeImportedFolderPath(folderPath) {
  return String(folderPath || '')
    .replace(/[\\/]+$/, '')
    .trim()
}

function buildImportedFolderTrackSeed(track) {
  if (!track?.path) return null
  return {
    name: track.name || fileNameFromPath(track.path),
    path: track.path,
    folder: getPathDirname(track.path),
    birthtimeMs: track.birthtimeMs || 0,
    mtimeMs: track.mtimeMs || 0,
    sizeBytes: track.sizeBytes || track.info?.sizeBytes || 0
  }
}

function buildLibraryTrackFingerprint(track) {
  if (!track) return ''
  if (track.birthtimeMs) return `birth:${track.birthtimeMs}`
  if (track.sizeBytes || track.mtimeMs) return `stat:${track.sizeBytes || 0}:${track.mtimeMs || 0}`
  return ''
}

function diffImportedFolderSnapshot(previousTracks, currentTracks) {
  const previousByPath = new Map((previousTracks || []).map((track) => [track.path, track]))
  const currentByPath = new Map((currentTracks || []).map((track) => [track.path, track]))
  const removedEntries = []
  const addedEntries = []

  for (const [path, track] of previousByPath) {
    if (!currentByPath.has(path)) removedEntries.push(track)
  }
  for (const [path, track] of currentByPath) {
    if (!previousByPath.has(path)) addedEntries.push(track)
  }

  const removedByFingerprint = new Map()
  const addedByFingerprint = new Map()
  const pushFingerprint = (map, track) => {
    const key = buildLibraryTrackFingerprint(track)
    if (!key) return
    const group = map.get(key)
    if (group) group.push(track)
    else map.set(key, [track])
  }

  removedEntries.forEach((track) => pushFingerprint(removedByFingerprint, track))
  addedEntries.forEach((track) => pushFingerprint(addedByFingerprint, track))

  const renamed = []
  for (const [fingerprint, removedGroup] of removedByFingerprint) {
    const addedGroup = addedByFingerprint.get(fingerprint)
    if (!addedGroup || removedGroup.length !== 1 || addedGroup.length !== 1) continue
    renamed.push({
      from: removedGroup[0].path,
      to: addedGroup[0].path,
      entry: addedGroup[0]
    })
  }

  const renamedFromSet = new Set(renamed.map((item) => item.from))
  const renamedToSet = new Set(renamed.map((item) => item.to))
  return {
    renamed,
    removedPaths: removedEntries
      .filter((track) => !renamedFromSet.has(track.path))
      .map((track) => track.path),
    added: addedEntries.filter((track) => !renamedToSet.has(track.path))
  }
}

function collectReferencedLibraryPaths({
  playlist = [],
  userPlaylists = [],
  likedPaths = [],
  playbackHistory = [],
  trackStats = {}
}) {
  const seen = new Set()
  const next = []
  const pushPath = (path) => {
    if (typeof path !== 'string' || !path || seen.has(path)) return
    if (isRemoteTrackPath(path)) return
    seen.add(path)
    next.push(path)
  }

  for (const track of playlist) pushPath(track?.path)
  for (const playlistItem of userPlaylists) {
    for (const path of playlistItem?.paths || []) pushPath(path)
  }
  for (const path of likedPaths) pushPath(path)
  for (const entry of playbackHistory) pushPath(entry?.path)
  for (const path of Object.keys(trackStats || {})) pushPath(path)
  return next
}

function normalizeTrackStatsMap(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const next = {}
  for (const [path, value] of Object.entries(raw)) {
    if (typeof path !== 'string' || !path || !value || typeof value !== 'object') continue
    const playCount = Number(value.playCount)
    const lastPlayedAt = Number(value.lastPlayedAt)
    next[path] = {
      playCount: Number.isFinite(playCount) && playCount > 0 ? Math.floor(playCount) : 0,
      lastPlayedAt: Number.isFinite(lastPlayedAt) && lastPlayedAt > 0 ? lastPlayedAt : 0
    }
  }
  return next
}

function createSmartCollectionDraft(source = null) {
  const rules = normalizeSmartCollectionRules(source?.rules)
  return {
    name: source?.name || '',
    matchMode: rules.matchMode,
    likedOnly: rules.likedOnly,
    minPlayCount: rules.minPlayCount ? String(rules.minPlayCount) : '',
    playedWithinDays: rules.playedWithinDays ? String(rules.playedWithinDays) : '',
    addedWithinDays: rules.addedWithinDays ? String(rules.addedWithinDays) : '',
    titleIncludes: rules.titleIncludes || '',
    artistIncludes: rules.artistIncludes || '',
    albumIncludes: rules.albumIncludes || ''
  }
}

function normalizeSmartCollectionDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {}
  return {
    name: String(source.name || '').trim(),
    rules: normalizeSmartCollectionRules({
      matchMode: source.matchMode,
      likedOnly: source.likedOnly === true,
      minPlayCount: source.minPlayCount,
      playedWithinDays: source.playedWithinDays,
      addedWithinDays: source.addedWithinDays,
      titleIncludes: source.titleIncludes,
      artistIncludes: source.artistIncludes,
      albumIncludes: source.albumIncludes
    })
  }
}

function createSmartCollectionTemplateDraft(templateKey) {
  switch (templateKey) {
    case 'recent-added':
      return createSmartCollectionDraft({
        name: 'Recently added',
        rules: { addedWithinDays: 14, matchMode: 'all' }
      })
    case 'recently-played':
      return createSmartCollectionDraft({
        name: 'Recently played a lot',
        rules: { playedWithinDays: 30, minPlayCount: 3, matchMode: 'all' }
      })
    case 'liked':
      return createSmartCollectionDraft({
        name: 'My likes',
        rules: { likedOnly: true, matchMode: 'all' }
      })
    default:
      return createSmartCollectionDraft({ rules: createEmptySmartCollectionRules() })
  }
}

function createUniqueSmartCollectionName(baseName, existingCollections = []) {
  const normalizedBase = String(baseName || '').trim() || 'Smart collection'
  const existingNames = new Set(
    (existingCollections || []).map((item) =>
      String(item?.name || '')
        .trim()
        .toLowerCase()
    )
  )
  if (!existingNames.has(normalizedBase.toLowerCase())) return normalizedBase
  let nextIndex = 2
  while (existingNames.has(`${normalizedBase} ${nextIndex}`.toLowerCase())) {
    nextIndex += 1
  }
  return `${normalizedBase} ${nextIndex}`
}

function createUniquePlaylistName(baseName, existingPlaylists = []) {
  const normalizedBase = String(baseName || '').trim() || 'Playlist'
  const existingNames = new Set(
    (existingPlaylists || []).map((item) =>
      String(item?.name || '')
        .trim()
        .toLowerCase()
    )
  )
  if (!existingNames.has(normalizedBase.toLowerCase())) return normalizedBase
  let nextIndex = 2
  while (existingNames.has(`${normalizedBase} ${nextIndex}`.toLowerCase())) {
    nextIndex += 1
  }
  return `${normalizedBase} ${nextIndex}`
}

const AlbumSidebarCard = memo(function AlbumSidebarCard({
  album,
  isSelected,
  onPickAlbum,
  onContextMenu
}) {
  const { t } = useTranslation()
  const [coverFailed, setCoverFailed] = useState(false)

  useEffect(() => {
    setCoverFailed(false)
  }, [album.cover])

  return (
    <button
      type="button"
      className={`album-card ${isSelected ? 'active' : ''}`}
      onClick={() => onPickAlbum(album)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, album) : undefined}
      title={t('albumCard.title', {
        name: album.name,
        count: album.tracks.length
      })}
    >
      {album.cover && !coverFailed ? (
        <img
          src={album.cover}
          alt={album.name}
          className="album-cover-image"
          loading={String(album.cover).startsWith('data:') ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div className="album-cover-fallback">
          <Image size={20} />
        </div>
      )}
      <div className="album-meta">
        <div className="album-title">{album.name}</div>
        <div className="album-subtitle">
          <span className="album-subtitle-artist">
            <ArtistLink
              artist={album.artist}
              className="artist-link-subtle album-subtitle-artist-link"
              stopPropagation
              noLink
            />
          </span>
          <span className="album-subtitle-sep">-</span>
          <span className="album-subtitle-count">{album.tracks.length} tracks</span>
        </div>
      </div>
    </button>
  )
})

const ArtistSidebarCard = memo(function ArtistSidebarCard({ artist, isSelected, onPickArtist }) {
  const [coverFailed, setCoverFailed] = useState(false)
  const avatarStyle = useMemo(
    () => ({ '--artist-avatar-hue': `${Number(artist.avatarHue || 0)}` }),
    [artist.avatarHue]
  )

  useEffect(() => {
    setCoverFailed(false)
  }, [artist.cover])

  return (
    <button
      type="button"
      className={`artist-card ${isSelected ? 'active' : ''}`}
      onClick={() => onPickArtist(artist)}
      title={`${artist.name} - ${artist.tracks.length} tracks`}
    >
      {artist.cover && !coverFailed ? (
        <img
          src={artist.cover}
          alt={artist.name}
          className="artist-avatar-image"
          loading={String(artist.cover).startsWith('data:') ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div className="artist-avatar-fallback" style={avatarStyle}>
          <span className="artist-avatar-initials">{artist.avatarInitials || '?'}</span>
        </div>
      )}
      <div className="artist-card-meta">
        <div className="artist-card-title">{artist.name}</div>
        <div className="artist-card-subtitle">{artist.tracks.length} tracks</div>
      </div>
    </button>
  )
})

function LastFmLoginForm({ onLogin }) {
  const [loading, setLoading] = React.useState(false)
  const [finishing, setFinishing] = React.useState(false)
  const [authToken, setAuthToken] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState('')

  const withTimeout = (task, message) =>
    Promise.race([
      task,
      new Promise((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, error: message })
        }, 15000)
      })
    ])

  const handleStartAuth = async () => {
    setError('')
    setStatus('')
    if (!window.api?.lastfm?.startWebAuth) {
      setError('Last.fm 授权接口不可用，请重启应用后再试')
      return
    }
    setLoading(true)
    try {
      const result = await withTimeout(
        window.api.lastfm.startWebAuth(),
        '打开 Last.fm 授权超时，请稍后再试'
      )
      if (result?.ok && result.token) {
        setAuthToken(result.token)
        setStatus('浏览器已打开，请在 Last.fm 点 Allow，然后回到这里完成连接。')
      } else {
        setError(result?.error || '无法打开 Last.fm 授权，请稍后再试')
      }
    } catch (err) {
      setError('无法打开 Last.fm 授权，请检查网络后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteAuth = async () => {
    setError('')
    if (!window.api?.lastfm?.completeWebAuth) {
      setError('Last.fm 授权接口不可用，请重启应用后再试')
      return
    }
    if (!authToken) {
      setError('请先打开 Last.fm 授权，并在浏览器里点 Allow。')
      return
    }
    setFinishing(true)
    try {
      const result = await withTimeout(
        window.api.lastfm.completeWebAuth(authToken),
        '完成 Last.fm 授权超时，请稍后再试'
      )
      if (result?.ok) {
        onLogin?.(result.sessionKey, result.username)
      } else {
        setError(result?.error || '尚未完成 Last.fm 授权，请在浏览器点 Allow 后再回来完成连接')
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="lastfm-login-form">
      <div className="setting-row lastfm-login-heading">
        <div className="setting-info" style={{ maxWidth: 'none' }}>
          <h3>Connect Last.fm</h3>
          <p>使用浏览器授权后自动记录听歌历史（Scrobble）。</p>
        </div>
      </div>
      <div className="lastfm-login-grid">
        <button
          className="lastfm-submit-btn"
          type="button"
          onClick={handleStartAuth}
          disabled={loading}
        >
          {loading ? '打开中...' : '打开 Last.fm 授权'}
        </button>
        <button
          className="lastfm-submit-btn"
          type="button"
          onClick={handleCompleteAuth}
          disabled={finishing || !authToken}
        >
          {finishing ? '连接中...' : '我已授权，完成连接'}
        </button>
      </div>
      {status ? <p className="lastfm-status">{status}</p> : null}
      {error ? <p className="lastfm-error">{error}</p> : null}
    </div>
  )
}
export default function App() {
  const { t } = useTranslation()
  const [appVersion, setAppVersion] = useState('')
  const [dynamicCoverTheme, setDynamicCoverTheme] = useState(null)
  const [updateStatus, setUpdateStatus] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState([])
  const [releaseNotesLoading, setReleaseNotesLoading] = useState(false)
  const [releaseNotesError, setReleaseNotesError] = useState('')
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)

  const [playlist, setPlaylist] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('playlist'),
      localValue: readStoredJson('nc_playlist'),
      normalize: (value) => (Array.isArray(value) ? value : undefined),
      fallback: []
    })
  })
  const [upNextQueue, setUpNextQueue] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('upNextQueue'),
      localValue: readStoredJson('nc_up_next_queue'),
      normalize: (value) => normalizeUpNextQueue(value),
      fallback: []
    })
  })
  const [playbackHistory, setPlaybackHistory] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('playbackHistory'),
      localValue: readStoredJson('nc_playback_history'),
      normalize: (value) =>
        Array.isArray(value)
          ? trimPlaybackHistoryEntries(value, DEFAULT_PLAYBACK_HISTORY_MAX)
          : undefined,
      fallback: []
    })
  })
  const [queuePlaybackEnabled, setQueuePlaybackEnabled] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('queuePlaybackEnabled'),
      localValue: localStorage.getItem('nc_queue_playback_enabled'),
      normalize: (value) => {
        if (typeof value === 'boolean') return value
        if (value == null) return undefined
        return value !== '0'
      },
      fallback: true
    })
  })
  const [playMode, setPlayMode] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('playMode'),
      localValue: localStorage.getItem('nc_playmode'),
      normalize: (value) => (typeof value === 'string' && value ? value : undefined),
      fallback: 'loop'
    })
  })

  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [sleepTimerActive, setSleepTimerActive] = useState(false)
  const [sleepTimerEndMs, setSleepTimerEndMs] = useState(null)
  const [sleepTimerNowMs, setSleepTimerNowMs] = useState(Date.now())
  const [coverUrl, setCoverUrl] = useState(null)
  const [coverUrlTrackPath, setCoverUrlTrackPath] = useState('')
  const [failedDisplayCoverUrl, setFailedDisplayCoverUrl] = useState(null)
  const crossfadeStateRef = useRef({
    active: false,
    sourcePath: '',
    targetPath: '',
    pendingFadeIn: false
  })
  const nextTrackRef = useRef(null)

  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [volume, setVolume] = useState(() => readStoredVolume())
  const remotePreviousVolumeRef = useRef(1)
  const [useNativeEngine, setUseNativeEngine] = useState(false)
  const [isAudioExclusive, setIsAudioExclusive] = useState(false)
  const useNativeEngineRef = useRef(false)
  const nativePlayJustCalledRef = useRef(false)
  const nativeSilentTrackSwitchRef = useRef('')
  const nativeSilentSwitchRecoveryTimerRef = useRef(0)
  const latestNativeAudioStatusRef = useRef(null)
  /** Avoid duplicate native playAudio for the same track (React Strict Mode double-invokes effects). */
  const nativePlayDedupeRef = useRef({ path: '', index: -1, t: 0 })
  const [isProgressDragging, setIsProgressDragging] = useState(false)
  const isProgressDraggingRef = useRef(false)
  const progressSeekValueRef = useRef(0)
  const [isSpeedDragging, setIsSpeedDragging] = useState(false)
  const [isVolumeDragging, setIsVolumeDragging] = useState(false)
  const [speedPopoverOpen, setSpeedPopoverOpen] = useState(false)
  const [activeDeckPopover, setActiveDeckPopover] = useState(null)
  const volumeDeckToolRef = useRef(null)
  const speedDeckToolRef = useRef(null)
  const [deckPopoverStyle, setDeckPopoverStyle] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [lyricsRenderTime, setLyricsRenderTime] = useState(0)
  const currentTrackPath = playlist[currentIndex]?.path || ''
  const [isSeeking, setIsSeeking] = useState(false)
  const isSeekingRef = useRef(false)
  useEffect(() => {
    isSeekingRef.current = isSeeking
  }, [isSeeking])

  useEffect(() => {
    if (!speedPopoverOpen) return
    const close = (e) => {
      if (!e.target.closest('.speed-popover')) setSpeedPopoverOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [speedPopoverOpen])

  useEffect(() => {
    if (!activeDeckPopover) return
    const close = (e) => {
      if (!e.target.closest('.deck-popover') && !e.target.closest('.deck-tool-trigger')) {
        setActiveDeckPopover(null)
        setDeckPopoverStyle(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [activeDeckPopover])

  const updateDeckPopoverPosition = useCallback((kind) => {
    const node = kind === 'volume' ? volumeDeckToolRef.current : speedDeckToolRef.current
    if (!node || typeof window === 'undefined') return
    const rect = node.getBoundingClientRect()
    const width = 236
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width
    const anchorCenter = rect.left + rect.width / 2
    const left = Math.max(16, Math.min(viewportWidth - width - 16, anchorCenter - width / 2))
    setDeckPopoverStyle({
      left: `${left}px`,
      right: 'auto',
      ['--deck-popover-anchor-x']: `${anchorCenter - left}px`
    })
  }, [])

  const toggleDeckPopover = useCallback(
    (kind) => {
      if (activeDeckPopover === kind) {
        setActiveDeckPopover(null)
        setDeckPopoverStyle(null)
        return
      }
      updateDeckPopoverPosition(kind)
      setActiveDeckPopover(kind)
    },
    [activeDeckPopover, updateDeckPopoverPosition]
  )

  useEffect(() => {
    if (!activeDeckPopover) return undefined
    const update = () => updateDeckPopoverPosition(activeDeckPopover)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [activeDeckPopover, updateDeckPopoverPosition])

  useEffect(() => {
    if (window.api?.getAppVersion) {
      window.api
        .getAppVersion()
        .then((v) => {
          if (v) setAppVersion(v)
        })
        .catch(console.error)
    }

    if (window.api?.onUpdaterEvent) {
      return window.api.onUpdaterEvent((msg) => {
        setUpdateStatus(msg)
        if (msg.event === 'update-available' || msg.event === 'update-downloaded') {
          setReleaseNotesOpen(true)
        }
        if (
          msg.event === 'update-available' ||
          msg.event === 'update-downloaded' ||
          msg.event === 'error' ||
          msg.event === 'update-not-available'
        ) {
          setIsUpdating(false)
        }
      })
    }
  }, [])

  const seekTimerRef = useRef(null)
  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isCardActionBusy, setIsCardActionBusy] = useState(false)
  const [shareCardSnapshot, setShareCardSnapshot] = useState(null)
  const trackLoadSeqRef = useRef(0)
  const albumCoverProbePathsRef = useRef(new Set())
  const syncedDisplayCoverCacheKeyRef = useRef('')
  const cloudCoverFetchSeqRef = useRef(0)
  const coverFailureFetchKeyRef = useRef('')
  const albumCloudCoverAttemptedRef = useRef(new Set())
  const albumCloudCoverPendingRef = useRef(new Set())
  const trackSwitchCountRef = useRef(0)
  const lyricsMvDeferredLoadRef = useRef(null)
  const lyricsMvSurfaceLoadKeyRef = useRef('')
  const lyricsLoadSurfaceActiveRef = useRef(false)
  const mvLoadSurfaceActiveRef = useRef(false)

  // MV State
  const [mvId, setMvId] = useState(null)
  const [isSearchingMV, setIsSearchingMV] = useState(false)
  const [autoMvSearchResults, setAutoMvSearchResults] = useState(null)
  const [youtubeMvLoginHint, setYoutubeMvLoginHint] = useState(false)
  const [signInStatus, setSignInStatus] = useState({
    youtube: false,
    bilibili: false,
    netease: false,
    qqMusic: false
  })
  const [biliDirectStream, setBiliDirectStream] = useState(null)
  const mvSearchCacheRef = useRef(new Map())
  const mvSearchPendingRef = useRef(new Map())
  const autoMvSearchByTrackRef = useRef(new Map())
  const biliStreamCacheRef = useRef(new Map())
  const biliStreamPendingRef = useRef(new Map())
  const lastResolvedMvTrackPathRef = useRef('')
  const lastMvIdentityRef = useRef('')
  const lastMvLoadRestartKeyRef = useRef('')
  const localMvBeforeCastRef = useRef(null)
  const mvSyncCooldownUntilRef = useRef(0)
  const lastMvDirectSeekRef = useRef({ key: '', at: 0, target: -1 })
  const lastMvIframeSeekRef = useRef({ key: '', at: 0, target: -1 })
  const lastMvTailPauseAtRef = useRef(0)
  const nextMvPreloadKeyRef = useRef('')

  useEffect(() => {
    const refresh = () => {
      window.api
        ?.checkSignInStatus?.()
        .then((s) => {
          if (s) setSignInStatus(s)
        })
        .catch(() => {})
    }
    refresh()
    const unsub = window.api?.onSignInStatusChanged?.(refresh)
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  useEffect(() => {
    if (!currentTrackPath) return
    if (lastResolvedMvTrackPathRef.current === currentTrackPath) return
    lastResolvedMvTrackPathRef.current = currentTrackPath
    lyricsMvDeferredLoadRef.current = null
    lyricsMvSurfaceLoadKeyRef.current = ''
    mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
    lastMvDirectSeekRef.current = { key: '', at: 0, target: -1 }
    lastMvIframeSeekRef.current = { key: '', at: 0, target: -1 }
    setYoutubeMvLoginHint(false)
    setMvId(null)
    setBiliDirectStream(null)
    setMvPlaybackQuality(null)
  }, [currentTrackPath])

  // Lyrics States
  const [showLyrics, setShowLyrics] = useState(false)
  const [lyrics, setLyrics] = useState([])
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1)
  const [lyricsDrawerOpen, setLyricsDrawerOpen] = useState(false)
  const [lyricsCandidateOpen, setLyricsCandidateOpen] = useState(false)
  const [lyricsCandidateLoading, setLyricsCandidateLoading] = useState(false)
  const [lyricsCandidateItems, setLyricsCandidateItems] = useState([])
  const lyricsCandidateSearchSeqRef = useRef(0)
  const [lyricsSourcePreferenceRevision, setLyricsSourcePreferenceRevision] = useState(0)
  const [lyricsInstrumentalRevision, setLyricsInstrumentalRevision] = useState(0)
  const [temporarilyHiddenLyricsTrackPath, setTemporarilyHiddenLyricsTrackPath] = useState('')
  const [temporarilyHiddenMvTrackPath, setTemporarilyHiddenMvTrackPath] = useState('')
  const [lyricsQuickBarDismissed, setLyricsQuickBarDismissed] = useState(false)
  const [lyricsQuickBarActivityAt, setLyricsQuickBarActivityAt] = useState(() => Date.now())
  const [lyricsDropActive, setLyricsDropActive] = useState(false)
  const [lyricsDropMessage, setLyricsDropMessage] = useState('')
  const lyricsDropDepthRef = useRef(0)
  const lyricsDropMessageTimerRef = useRef(null)
  const localLyricsPriorityRef = useRef(null)
  const isCurrentTrackLyricsTemporarilyHidden =
    !!currentTrackPath && temporarilyHiddenLyricsTrackPath === currentTrackPath
  const isCurrentTrackLyricsInstrumental = useMemo(
    () => !!currentTrackPath && getLyricsInstrumentalFlagForPath(currentTrackPath),
    [currentTrackPath, lyricsInstrumentalRevision]
  )
  const isCurrentTrackMvTemporarilyHidden =
    !!currentTrackPath && temporarilyHiddenMvTrackPath === currentTrackPath
  const [downloaderDrawerOpen, setDownloaderDrawerOpen] = useState(false)
  const [mvDrawerOpen, setMvDrawerOpen] = useState(false)
  const [castDrawerOpen, setCastDrawerOpen] = useState(false)
  const [castSendDrawerOpen, setCastSendDrawerOpen] = useState(false)
  const [listenTogetherDrawerOpen, setListenTogetherDrawerOpen] = useState(false)
  const [phoneRemoteDrawerOpen, setPhoneRemoteDrawerOpen] = useState(false)
  const [phoneRemoteStatus, setPhoneRemoteStatus] = useState(null)
  const [phoneRemoteBusy, setPhoneRemoteBusy] = useState(false)
  const [phoneRemoteSearchQuery, setPhoneRemoteSearchQuery] = useState('')
  const [phoneRemoteSearchResults, setPhoneRemoteSearchResults] = useState([])
  const [phoneRemoteLibraryView, setPhoneRemoteLibraryView] = useState({
    query: '',
    offset: 0,
    total: 0,
    paths: []
  })
  const phoneRemoteTrackIdMapRef = useRef(new Map())
  const [pluginDrawerOpen, setPluginDrawerOpen] = useState(false)
  const [audioSettingsDrawerOpen, setAudioSettingsDrawerOpen] = useState(false)
  const [metadataEditorOpen, setMetadataEditorOpen] = useState(false)
  const [metadataEditorTrack, setMetadataEditorTrack] = useState(null)
  const [batchRenameOpen, setBatchRenameOpen] = useState(false)
  const [quickEditField, setQuickEditField] = useState(null)
  const [quickEditDraft, setQuickEditDraft] = useState('')
  const [quickEditBusy, setQuickEditBusy] = useState(false)
  const [quickEditModifierActive, setQuickEditModifierActive] = useState(false)
  const [listenTogetherRoomState, setListenTogetherRoomState] = useState(null)
  const [castRemoteActive, setCastRemoteActive] = useState(false)
  const [castDlnaListening, setCastDlnaListening] = useState(false)
  const [lastCastStatus, setLastCastStatus] = useState(null)
  const [remoteLibrarySources, setRemoteLibrarySources] = useState([])
  const [remoteLibraryEncryptionAvailable, setRemoteLibraryEncryptionAvailable] = useState(false)
  const [activeRemoteLibrarySourceId, setActiveRemoteLibrarySourceId] = useState('')
  const [mvPlaybackQuality, setMvPlaybackQuality] = useState(null)
  const [lyricsMatchStatus, setLyricsMatchStatus] = useState('idle')
  const lyricsMatchStatusRef = useRef('idle')
  const lyricsLoadedTrackPathRef = useRef('')
  const [lyricsSourceStatus, setLyricsSourceStatus] = useState({
    kind: 'idle',
    detail: '',
    origin: ''
  })
  const [romajiDisplayLines, setRomajiDisplayLines] = useState([])
  const romajiConversionCacheRef = useRef(new Map())
  const [metadata, setMetadata] = useState({
    title: '',
    artist: '',
    album: '',
    albumArtist: '',
    trackNo: null,
    discNo: null
  })
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [listMode, setListMode] = useState('songs')
  const [navPlaylistsExpanded, setNavPlaylistsExpanded] = useState(false)
  const [userPlaylists, setUserPlaylists] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('userPlaylists'),
      localValue: readStoredJson('nc_user_playlists'),
      normalize: (value) => (Array.isArray(value) ? value : undefined),
      fallback: []
    })
  })
  const [userSmartCollections, setUserSmartCollections] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('userSmartCollections'),
      localValue: readStoredJson(USER_SMART_COLLECTIONS_LOCAL_KEY),
      normalize: (value) => {
        const normalized = normalizeUserSmartCollections(value)
        return Array.isArray(normalized) ? normalized : undefined
      },
      fallback: []
    })
  })
  const [displayMetadataOverrides, setDisplayMetadataOverrides] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('displayMetadataOverrides'),
      localValue: readStoredJson(DISPLAY_METADATA_OVERRIDES_LOCAL_KEY),
      normalize: (value) => normalizeDisplayMetadataOverrides(value),
      fallback: {}
    })
  })
  const playlistStoreHydratedRef = useRef(false)
  const userPlaylistsStoreHydratedRef = useRef(false)
  const userSmartCollectionsStoreHydratedRef = useRef(false)
  const displayMetadataOverridesHydratedRef = useRef(false)
  const configStoreHydratedRef = useRef(false)
  const likedPathsStoreHydratedRef = useRef(false)
  const upNextQueueStoreHydratedRef = useRef(false)
  const playModeStoreHydratedRef = useRef(false)
  const queuePlaybackStoreHydratedRef = useRef(false)
  const trackStatsStoreHydratedRef = useRef(false)
  const playbackHistoryStoreHydratedRef = useRef(false)
  const volumeStoreHydratedRef = useRef(false)
  const [selectedUserPlaylistId, setSelectedUserPlaylistId] = useState(null)
  const [selectedSmartCollectionId, setSelectedSmartCollectionId] = useState(null)
  const [smartCollectionEditorOpen, setSmartCollectionEditorOpen] = useState(false)
  const [editingSmartCollectionId, setEditingSmartCollectionId] = useState(null)
  const [smartCollectionDraft, setSmartCollectionDraft] = useState(() =>
    createSmartCollectionDraft({ rules: createEmptySmartCollectionRules() })
  )
  const [playlistLibraryMoreOpen, setPlaylistLibraryMoreOpen] = useState(false)
  const playlistLibraryMoreRef = useRef(null)
  const [addToPlaylistMenu, setAddToPlaylistMenu] = useState(null)
  const [likedPaths, setLikedPaths] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('likedPaths'),
      localValue: readStoredJson('nc_liked_paths'),
      normalize: (value) =>
        Array.isArray(value) ? value.filter((x) => typeof x === 'string') : undefined,
      fallback: []
    })
  })
  const [trackStats, setTrackStats] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('trackStats'),
      localValue: readStoredJson('nc_track_stats'),
      normalize: (value) =>
        value && typeof value === 'object' ? normalizeTrackStatsMap(value) : undefined,
      fallback: {}
    })
  })
  const [activePlaybackContext, setActivePlaybackContext] = useState(() =>
    createPlaybackContext('library', 'library', [])
  )
  const [showLikedOnly, setShowLikedOnly] = useState(false)
  const [trackContextMenu, setTrackContextMenu] = useState(null)
  const [ctxMenuVisualOpen, setCtxMenuVisualOpen] = useState(false)
  const ctxMenuCloseTimerRef = useRef(null)
  const trackContextMenuRef = useRef(null)
  const [coverContextMenu, setCoverContextMenu] = useState(null)
  const [coverCtxVisualOpen, setCoverCtxVisualOpen] = useState(false)
  const coverCtxCloseTimerRef = useRef(null)
  const coverContextMenuRef = useRef(null)
  const [groupContextMenu, setGroupContextMenu] = useState(null)
  const [groupCtxVisualOpen, setGroupCtxVisualOpen] = useState(false)
  const groupCtxCloseTimerRef = useRef(null)
  const groupContextMenuRef = useRef(null)
  const songCardCaptureRef = useRef(null)
  const [addPlVisualOpen, setAddPlVisualOpen] = useState(false)
  const addPlCloseTimerRef = useRef(null)
  const playlistRef = useRef(playlist)
  const currentIndexRef = useRef(currentIndex)
  const isPlayingRef = useRef(isPlaying)
  const currentTimeRef = useRef(currentTime)
  const playbackUiTimeFlushRef = useRef({
    at: 0,
    value: Math.max(0, Number(currentTime) || 0),
    second: Math.floor(Math.max(0, Number(currentTime) || 0))
  })
  const miniPlayerWindowOpenRef = useRef(false)
  const durationRef = useRef(duration)
  const upNextQueueRef = useRef(upNextQueue)
  const playbackHistoryRef = useRef(playbackHistory)
  const userPlaylistsRef = useRef(userPlaylists)
  const likedPathsRef = useRef(likedPaths)
  const trackStatsRef = useRef(trackStats)
  const trackStatsCommitTimerRef = useRef(null)
  const displayMetadataOverridesRef = useRef(displayMetadataOverrides)
  const activePlaybackContextRef = useRef(activePlaybackContext)
  const playbackSessionSeedRef = useRef(
    normalizePlaybackSession(getInitialAppStateValue('playbackSession')) ||
      normalizePlaybackSession(readStoredJson(PLAYBACK_SESSION_LOCAL_KEY))
  )
  const playbackSessionLastProgressPersistRef = useRef(0)
  const playbackSessionRestoreAttemptedRef = useRef(false)
  const pendingTrackStartRef = useRef(null)
  const lastLoadedTrackPathRef = useRef('')
  const trackStartedAtRef = useRef(null)
  const scrobbledRef = useRef(false)
  const lastLastFmTrackKeyRef = useRef('')
  const lastLastFmNowPlayingKeyRef = useRef('')
  const lastLastFmScrobbleKeyRef = useRef('')
  const lastFmScrobbleInFlightRef = useRef(false)
  const historyNavigationRef = useRef(false)
  const lastHistoryTrackedPathRef = useRef('')
  const lastStatsTrackedPathRef = useRef('')
  const startupExclusiveResetRef = useRef(false)
  const releaseNotesFetchedRef = useRef(false)
  const releaseNotesLoadingRef = useRef(false)
  const releaseNotesLastAttemptAtRef = useRef(0)
  const libraryMetaCacheHydrationKeyRef = useRef('')
  const artistAvatarAttemptedRef = useRef(new Set())
  const artistAvatarLookupAvailableAtRef = useRef(0)
  const lastArtistAvatarLookupAtRef = useRef(0)
  const artistAvatarRetryTimerRef = useRef(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const newPlaylistInputRef = useRef(null)
  const [quickNewPlaylistName, setQuickNewPlaylistName] = useState('')
  const [selectedAlbum, setSelectedAlbum] = useState('all')
  const [selectedFolder, setSelectedFolder] = useState('all')
  const [selectedArtist, setSelectedArtist] = useState('all')
  const selectedArtistTracksRef = useRef({ name: '', tracks: [], source: null })
  const [artistDetailLeaving, setArtistDetailLeaving] = useState(false)
  const artistDetailLeaveTimerRef = useRef(null)
  const [songSortMode, setSongSortMode] = useState('default') // 'default' | 'dateAsc' | 'dateDesc' | 'frequentDesc' | 'random'
  const [songRandomSortSeed, setSongRandomSortSeed] = useState(() => createSongRandomSortSeed())
  const [songSortOpen, setSongSortOpen] = useState(false)
  const songSortRef = useRef(null)
  const [albumSortMode, setAlbumSortMode] = useState('default')
  const [albumSortOpen, setAlbumSortOpen] = useState(false)
  const albumSortRef = useRef(null)
  const [artistSortMode, setArtistSortMode] = useState('default')
  const [artistSortOpen, setArtistSortOpen] = useState(false)
  const artistSortRef = useRef(null)
  const [folderSortMode, setFolderSortMode] = useState('default') // 'default' | 'dateAsc' | 'dateDesc'
  const [folderSortOpen, setFolderSortOpen] = useState(false)
  const folderSortRef = useRef(null)
  const [importedFolders, setImportedFolders] = useState(() => {
    return pickInitialPersistedValue({
      snapshotValue: getInitialAppStateValue('importedFolders'),
      localValue: readStoredJson('nc_imported_folders'),
      normalize: (value) => (Array.isArray(value) ? value : undefined),
      fallback: []
    })
  })
  const importedFoldersHydratedRef = useRef(false)
  const startupImportedFolderRescanDoneRef = useRef(false)
  const startupImportedFolderRescanTimerRef = useRef(null)
  const [libraryStateReady, setLibraryStateReady] = useState(false)
  const [playbackSessionRestoreReady, setPlaybackSessionRestoreReady] = useState(false)
  const [libraryCleanupBusy, setLibraryCleanupBusy] = useState(false)
  const [missingLibraryPaths, setMissingLibraryPaths] = useState([])
  const [trackMetaMap, setTrackMetaMap] = useState({})
  const [albumCoverMap, setAlbumCoverMap] = useState({})
  const [artistAvatarMap, setArtistAvatarMap] = useState({})
  const [artistAvatarRetryNonce, setArtistAvatarRetryNonce] = useState(0)
  const trackMetaMapRef = useRef(trackMetaMap)
  const parsedPlaylistCacheRef = useRef(null)
  const albumCoverCachePersistedEntriesRef = useRef(new Set())
  const [technicalInfo, setTechnicalInfo] = useState({
    sampleRate: null,
    originalBpm: null,
    channels: null,
    bitrate: null,
    bitDepth: null,
    isMqa: false,
    codec: null
  })
  const [bpmDetectionState, setBpmDetectionState] = useState('idle')
  const [isConverting, setIsConverting] = useState(false)
  const [conversionMsg, setConversionMsg] = useState('')
  const [audioDevices, setAudioDevices] = useState([])
  const [queueDragOver, setQueueDragOver] = useState(false)
  const [queueUndoStack, setQueueUndoStack] = useState([])
  const [selectedSidebarTrackPaths, setSelectedSidebarTrackPaths] = useState([])
  const lastSelectedSidebarTrackPathRef = useRef('')
  const autoLocateHandledTrackPathRef = useRef('')

  // Hi-Fi & Navigation States
  const [view, setView] = useState('player') // 'player', 'lyrics', 'settings'
  const [settingsQuery, setSettingsQuery] = useState('')
  const [activeSettingsSection, setActiveSettingsSection] = useState('language')
  const [config, setConfig] = useState(() => {
    const saved = getInitialAppStateValue('config')
    if (saved && typeof saved === 'object') return normalizeConfigState(saved)
    return normalizeConfigState(readStoredJson('nc_config'))
  })
  const [eqSoloBandIdx, setEqSoloBandIdx] = useState(null)
  const [eqAdvancedOpen, setEqAdvancedOpen] = useState(false)
  const nativeHtmlAudioMirrorNeeded = view === 'settings' && eqAdvancedOpen
  const nativeHtmlAudioMirrorNeededRef = useRef(nativeHtmlAudioMirrorNeeded)
  const libraryBrowserVisible = !showLyrics && view !== 'settings'
  const lyricsLoadSurfaceActive =
    (view === 'player' && showLyrics) || config.desktopLyricsEnabled === true
  const lyricsTimingSurfaceActive =
    !isCurrentTrackLyricsInstrumental &&
    ((view === 'player' && showLyrics && config.lyricsHidden !== true) ||
      config.desktopLyricsEnabled === true)
  const mvLoadSurfaceActive =
    shouldLoadMvForSurface(config, { view, showLyrics }) ||
    shouldSearchMvForPlayback(config, { view })
  useEffect(() => {
    nativeHtmlAudioMirrorNeededRef.current = nativeHtmlAudioMirrorNeeded
  }, [nativeHtmlAudioMirrorNeeded])
  useEffect(() => {
    lyricsLoadSurfaceActiveRef.current = lyricsLoadSurfaceActive
    mvLoadSurfaceActiveRef.current = mvLoadSurfaceActive
  }, [lyricsLoadSurfaceActive, mvLoadSurfaceActive])
  const effectiveEqBands = useMemo(() => {
    const list = Array.isArray(config.eqBands) ? config.eqBands : []
    if (eqSoloBandIdx === null || eqSoloBandIdx < 0 || eqSoloBandIdx >= list.length) return list
    return list.map((band, index) => (index === eqSoloBandIdx ? band : { ...band, gain: 0 }))
  }, [config.eqBands, eqSoloBandIdx])
  useEffect(() => {
    if (eqSoloBandIdx !== null && eqSoloBandIdx >= (config.eqBands?.length ?? 0)) {
      setEqSoloBandIdx(null)
    }
  }, [config.eqBands?.length, eqSoloBandIdx])
  const settingsSearchInputRef = useRef(null)
  const settingsContentRef = useRef(null)
  const settingsScrollbarDragRef = useRef(null)
  const pendingSettingsScrollRef = useRef(null)
  const settingsNavLockRef = useRef({ sectionKey: '', until: 0 })
  const [settingsScrollMetrics, setSettingsScrollMetrics] = useState({
    visible: false,
    thumbTop: 0,
    thumbHeight: 0
  })

  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  const settingsSectionVisibility = useMemo(() => {
    return {
      language: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.language),
      engine: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.engine),
      integrations:
        matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.integrations) ||
        matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.lastfm),
      remoteLibrary: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.remoteLibrary),
      eq: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.eq),
      aesthetics: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.aesthetics),
      media: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.media),
      about: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.about),
      danger: matchesSettingsSection(settingsQuery, SETTINGS_SECTION_KEYWORDS.danger)
    }
  }, [settingsQuery])
  const settingsHasResults = Object.values(settingsSectionVisibility).some(Boolean)
  const settingsNavItems = useMemo(
    () => [
      {
        key: 'language',
        icon: Globe,
        label: t('settings.nav.general'),
        description: t('settings.nav.generalDesc'),
        id: 'settings-sec-language'
      },
      {
        key: 'engine',
        icon: Zap,
        label: t('settings.nav.playback'),
        description: t('settings.nav.playbackDesc'),
        id: 'settings-sec-engine'
      },
      {
        key: 'integrations',
        icon: Link,
        label: t('settings.nav.connections'),
        description: t('settings.nav.connectionsDesc'),
        id: 'settings-sec-integrations'
      },
      {
        key: 'remoteLibrary',
        icon: Globe,
        label: t('settings.nav.remoteLibrary'),
        description: t('settings.nav.remoteLibraryDesc'),
        id: 'settings-sec-remote-library'
      },
      {
        key: 'eq',
        icon: Sliders,
        label: t('settings.nav.eq'),
        description: t('settings.nav.eqDesc'),
        id: 'settings-sec-eq'
      },
      {
        key: 'aesthetics',
        icon: Palette,
        label: t('settings.nav.appearance'),
        description: t('settings.nav.appearanceDesc'),
        id: 'settings-sec-aesthetics'
      },
      {
        key: 'downloader',
        icon: Download,
        label: t('settings.nav.libraryMedia'),
        description: t('settings.nav.libraryMediaDesc'),
        id: 'settings-sec-downloader'
      },
      {
        key: 'about',
        icon: Info,
        label: t('settings.nav.aboutAdvanced'),
        description: t('settings.nav.aboutAdvancedDesc'),
        id: 'settings-sec-about'
      },
      {
        key: 'danger',
        icon: Trash2,
        label: t('settings.nav.dangerActions'),
        description: t('settings.nav.dangerActionsDesc'),
        id: 'settings-sec-danger'
      }
    ],
    [t]
  )

  const reloadRemoteLibrarySources = useCallback(async () => {
    try {
      const result = await window.api?.remoteLibrary?.listSources?.()
      if (!result?.ok) return
      const sources = Array.isArray(result.sources) ? result.sources : []
      setRemoteLibrarySources(sources)
      setRemoteLibraryEncryptionAvailable(Boolean(result.encryptionAvailable))
      setActiveRemoteLibrarySourceId((current) =>
        current && sources.some((source) => source.id === current) ? current : sources[0]?.id || ''
      )
    } catch (error) {
      console.warn('[remote-library] list sources failed:', error?.message || error)
    }
  }, [])

  useEffect(() => {
    reloadRemoteLibrarySources()
  }, [reloadRemoteLibrarySources])

  const scrollSettingsSectionIntoView = useCallback((sectionId, behavior = 'smooth') => {
    const root = settingsContentRef.current
    const target = document.getElementById(sectionId)
    if (!root || !target) return false

    const rootRect = root.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = Math.max(0, root.scrollTop + targetRect.top - rootRect.top - 2)

    root.scrollTo({ top: nextTop, behavior })
    return true
  }, [])

  const getSettingsSectionNearTop = useCallback(() => {
    const root = settingsContentRef.current
    if (!root) return ''
    const rootRect = root.getBoundingClientRect()
    const visibleItems = settingsNavItems
      .map((item) => ({ item, target: document.getElementById(item.id) }))
      .filter(({ target }) => target && target.offsetParent !== null)
    if (!visibleItems.length) return ''
    const bottomGap = root.scrollHeight - root.scrollTop - root.clientHeight
    if (bottomGap <= 8) return visibleItems[visibleItems.length - 1].item.key

    let fallbackKey = ''
    let fallbackDistance = Number.POSITIVE_INFINITY
    let currentKey = ''
    let currentTop = Number.NEGATIVE_INFINITY

    visibleItems.forEach(({ item, target }) => {
      const offsetTop = target.getBoundingClientRect().top - rootRect.top
      const distance = Math.abs(offsetTop)
      if (distance < fallbackDistance) {
        fallbackDistance = distance
        fallbackKey = item.key
      }
      if (offsetTop <= 28 && offsetTop > currentTop) {
        currentTop = offsetTop
        currentKey = item.key
      }
    })

    return currentKey || fallbackKey
  }, [settingsNavItems])

  const handleSettingsNavClick = useCallback(
    (sectionKey, sectionId) => {
      settingsNavLockRef.current = { sectionKey, until: Date.now() + 700 }
      setActiveSettingsSection(sectionKey)
      if (settingsQuery.trim()) {
        pendingSettingsScrollRef.current = { sectionId, sectionKey }
        setSettingsQuery('')
        return
      }
      scrollSettingsSectionIntoView(sectionId)
    },
    [scrollSettingsSectionIntoView, settingsQuery]
  )

  useLayoutEffect(() => {
    if (view !== 'settings' || settingsQuery.trim()) return
    const pending = pendingSettingsScrollRef.current
    if (!pending) return
    pendingSettingsScrollRef.current = null
    const frameId = requestAnimationFrame(() => {
      settingsNavLockRef.current = { sectionKey: pending.sectionKey, until: Date.now() + 700 }
      setActiveSettingsSection(pending.sectionKey)
      scrollSettingsSectionIntoView(pending.sectionId)
    })
    return () => cancelAnimationFrame(frameId)
  }, [scrollSettingsSectionIntoView, settingsQuery, settingsHasResults, view])

  useEffect(() => {
    if (view !== 'settings') return
    setSettingsQuery('')
    setActiveSettingsSection('language')
    const focusTimer = setTimeout(() => {
      settingsSearchInputRef.current?.focus()
    }, 0)
    return () => clearTimeout(focusTimer)
  }, [view])

  useEffect(() => {
    if (view !== 'settings' || settingsQuery.trim()) return
    const root = settingsContentRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const sectionElements = settingsNavItems
      .map((item) => document.getElementById(item.id))
      .filter(Boolean)
    if (sectionElements.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        const lock = settingsNavLockRef.current
        if (lock.sectionKey && Date.now() < lock.until) return
        const sectionKey = getSettingsSectionNearTop()
        if (sectionKey) setActiveSettingsSection(sectionKey)
      },
      {
        root,
        threshold: 0.3
      }
    )
    sectionElements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [getSettingsSectionNearTop, settingsNavItems, settingsQuery, view])

  const updateSettingsScrollMetrics = useCallback(() => {
    const root = settingsContentRef.current
    if (view !== 'settings' || !root) {
      setSettingsScrollMetrics((prev) =>
        prev.visible || prev.thumbTop || prev.thumbHeight
          ? { visible: false, thumbTop: 0, thumbHeight: 0 }
          : prev
      )
      return
    }

    const scrollHeight = root.scrollHeight
    const clientHeight = root.clientHeight
    const visible = scrollHeight > clientHeight + 2
    if (!visible) {
      setSettingsScrollMetrics((prev) =>
        prev.visible || prev.thumbTop || prev.thumbHeight
          ? { visible: false, thumbTop: 0, thumbHeight: 0 }
          : prev
      )
      return
    }

    const thumbHeight = Math.max(54, Math.round((clientHeight / scrollHeight) * clientHeight))
    const maxScrollTop = Math.max(1, scrollHeight - clientHeight)
    const maxThumbTop = Math.max(0, clientHeight - thumbHeight)
    const thumbTop = Math.round((root.scrollTop / maxScrollTop) * maxThumbTop)

    setSettingsScrollMetrics((prev) =>
      prev.visible === visible && prev.thumbTop === thumbTop && prev.thumbHeight === thumbHeight
        ? prev
        : { visible, thumbTop, thumbHeight }
    )
  }, [view])

  useLayoutEffect(() => {
    if (view !== 'settings') {
      updateSettingsScrollMetrics()
      return undefined
    }
    const root = settingsContentRef.current
    if (!root) return undefined

    let frameId = 0
    const scheduleUpdate = () => {
      if (frameId) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        frameId = 0
        updateSettingsScrollMetrics()
      })
    }

    scheduleUpdate()
    root.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null
    observer?.observe(root)
    if (root.firstElementChild) observer?.observe(root.firstElementChild)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      root.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      observer?.disconnect()
    }
  }, [settingsHasResults, settingsQuery, updateSettingsScrollMetrics, view])

  const scrollSettingsContentToPointer = useCallback((clientY) => {
    const root = settingsContentRef.current
    const drag = settingsScrollbarDragRef.current
    if (!root || !drag?.track) return

    const rect = drag.track.getBoundingClientRect()
    const maxThumbTop = Math.max(1, rect.height - drag.thumbHeight)
    const nextThumbTop = Math.min(maxThumbTop, Math.max(0, clientY - rect.top - drag.pointerOffset))
    const ratio = nextThumbTop / maxThumbTop
    root.scrollTop = ratio * Math.max(0, root.scrollHeight - root.clientHeight)
  }, [])

  const handleSettingsScrollbarPointerDown = useCallback(
    (event) => {
      if (!settingsScrollMetrics.visible) return
      const target = event.target
      const thumb = target?.closest?.('.settings-scrollbar-thumb')
      const track = event.currentTarget
      const thumbRect = thumb?.getBoundingClientRect?.()
      const pointerOffset = thumbRect
        ? event.clientY - thumbRect.top
        : settingsScrollMetrics.thumbHeight / 2

      settingsScrollbarDragRef.current = {
        track,
        pointerOffset,
        thumbHeight: settingsScrollMetrics.thumbHeight
      }
      track.setPointerCapture?.(event.pointerId)
      scrollSettingsContentToPointer(event.clientY)
      event.preventDefault()
    },
    [
      scrollSettingsContentToPointer,
      settingsScrollMetrics.thumbHeight,
      settingsScrollMetrics.visible
    ]
  )

  const handleSettingsScrollbarPointerMove = useCallback(
    (event) => {
      if (!settingsScrollbarDragRef.current) return
      scrollSettingsContentToPointer(event.clientY)
    },
    [scrollSettingsContentToPointer]
  )

  const handleSettingsScrollbarPointerUp = useCallback((event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    settingsScrollbarDragRef.current = null
  }, [])

  useEffect(() => {
    if (config.sleepTimerEnabled !== true) return
    setConfig((prev) => ({ ...prev, sleepTimerEnabled: false }))
  }, [])

  const stopPlaybackForSleepTimer = useCallback(() => {
    setIsPlaying(false)
    if (window.api?.pauseAudio) {
      void window.api.pauseAudio().catch(() => {})
    }
  }, [])

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerActive(false)
    setSleepTimerEndMs(null)
    setConfig((prev) =>
      prev.sleepTimerEnabled === false ? prev : { ...prev, sleepTimerEnabled: false }
    )
  }, [])

  const startSleepTimer = useCallback(() => {
    setSleepTimerActive(true)
    setConfig((prev) =>
      prev.sleepTimerEnabled === true ? prev : { ...prev, sleepTimerEnabled: true }
    )
    if (config.sleepTimerMode === 'time') {
      setSleepTimerEndMs(Date.now() + Number(config.sleepTimerMinutes || 30) * 60 * 1000)
    } else {
      setSleepTimerEndMs(null)
    }
  }, [config.sleepTimerMinutes, config.sleepTimerMode])

  const sleepTimerRemainingMs =
    sleepTimerActive && config.sleepTimerMode === 'time' && sleepTimerEndMs
      ? Math.max(0, sleepTimerEndMs - sleepTimerNowMs)
      : 0

  const resetCrossfadeState = useCallback(() => {
    crossfadeStateRef.current = {
      active: false,
      sourcePath: '',
      targetPath: '',
      pendingFadeIn: false
    }
  }, [])

  const cancelCrossfade = useCallback(() => {
    resetCrossfadeState()
    if (window.api?.audioCancelAutomix) {
      void window.api.audioCancelAutomix().catch(() => {})
    }
    if (window.api?.audioCancelFade) {
      void window.api.audioCancelFade().catch(() => {})
    }
  }, [resetCrossfadeState])

  const maybeArmNativeAutomixFromClock = useCallback(
    (positionSec) => {
      if (!useNativeEngineRef.current || !window.api?.audioStartAutomixNext) return
      const sourceConfig = configRef.current || {}
      if (!sourceConfig.crossfadeEnabled || !isPlayingRef.current) return
      if (sourceConfig.gaplessEnabled || playbackRateRef.current !== 1) return

      const currentTrackPath = playlistRef.current[currentIndexRef.current]?.path || ''
      const targetPath = nextTrackRef.current?.path || ''
      if (!currentTrackPath || !targetPath || targetPath === currentTrackPath) return
      if (playlistRef.current.length < 2) return
      if (
        crossfadeStateRef.current.active &&
        crossfadeStateRef.current.sourcePath === currentTrackPath &&
        crossfadeStateRef.current.targetPath === targetPath
      ) {
        return
      }

      const trackDuration = Number(durationRef.current) || 0
      const playbackPosition = Math.max(0, Number(positionSec) || 0)
      if (!(trackDuration > 0) || !(playbackPosition >= 0)) return

      const remainingSec = trackDuration - playbackPosition
      const baseDurationSec = Math.max(1, Math.min(12, Number(sourceConfig.crossfadeDuration || 6)))
      const trackBoundedDuration = Math.max(
        1,
        Math.min(baseDurationSec, trackDuration * 0.18, Math.max(1, trackDuration - 1))
      )
      const primingLeadSec = 0.65
      if (remainingSec > trackBoundedDuration + primingLeadSec || remainingSec < 0) return

      const transitionSec = Math.max(1, Math.min(trackBoundedDuration, remainingSec || 1))
      const leadSec = Math.max(0, Math.min(primingLeadSec, remainingSec - transitionSec))

      crossfadeStateRef.current = {
        active: true,
        sourcePath: currentTrackPath,
        targetPath,
        pendingFadeIn: false
      }

      void window.api
        .audioStartAutomixNext(targetPath, {
          durationSec: transitionSec,
          leadSec
        })
        .then((result) => {
          if (!result?.ok && crossfadeStateRef.current.targetPath === targetPath) {
            resetCrossfadeState()
          }
        })
        .catch(() => {
          if (crossfadeStateRef.current.targetPath === targetPath) resetCrossfadeState()
        })
    },
    [resetCrossfadeState]
  )

  useEffect(() => {
    if (!sleepTimerActive || config.sleepTimerMode !== 'time' || !sleepTimerEndMs) return undefined

    setSleepTimerNowMs(Date.now())
    const timer = setInterval(() => {
      const now = Date.now()
      setSleepTimerNowMs(now)
      if (now >= sleepTimerEndMs) {
        stopPlaybackForSleepTimer()
        cancelSleepTimer()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [
    cancelSleepTimer,
    config.sleepTimerMode,
    sleepTimerActive,
    sleepTimerEndMs,
    stopPlaybackForSleepTimer
  ])

  useEffect(() => {
    if (!sleepTimerActive) return
    if (config.sleepTimerMode === 'time') {
      setSleepTimerEndMs(Date.now() + Number(config.sleepTimerMinutes || 30) * 60 * 1000)
      return
    }
    setSleepTimerEndMs(null)
  }, [config.sleepTimerMinutes, config.sleepTimerMode, sleepTimerActive])

  const loadReleaseNotes = useCallback(
    async (force = false) => {
      if (configRef.current.networkAccessDisabled === true) {
        setReleaseNotesError(t('settings.networkDisabledStatus', 'Network access is disabled.'))
        return
      }
      if (releaseNotesLoadingRef.current) return
      if (releaseNotesFetchedRef.current && !force) return

      const now = Date.now()
      if (
        !force &&
        releaseNotesLastAttemptAtRef.current > 0 &&
        now - releaseNotesLastAttemptAtRef.current < RELEASE_NOTES_AUTO_RETRY_COOLDOWN_MS
      ) {
        return
      }

      const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null
      const timeoutId = abortController
        ? window.setTimeout(() => abortController.abort(), RELEASE_NOTES_FETCH_TIMEOUT_MS)
        : 0

      releaseNotesLoadingRef.current = true
      releaseNotesLastAttemptAtRef.current = now
      setReleaseNotesLoading(true)
      setReleaseNotesError('')

      try {
        const response = await fetch(GITHUB_RELEASES_API_URL, {
          headers: {
            Accept: 'application/vnd.github+json'
          },
          ...(abortController ? { signal: abortController.signal } : {})
        })
        if (!response.ok) {
          throw new Error(`github_${response.status}`)
        }
        const data = await response.json()
        const releases = Array.isArray(data)
          ? data
              .filter((item) => item && item.draft !== true)
              .map((item) => ({
                version: normalizeReleaseVersion(item.tag_name || item.name || ''),
                title: item.name || item.tag_name || 'Release',
                url: item.html_url || GITHUB_RELEASES_PAGE_URL,
                publishedAt: item.published_at || '',
                publishedLabel: item.published_at
                  ? new Date(item.published_at).toLocaleDateString()
                  : '',
                previewLines: buildReleasePreviewLines(item.body)
              }))
              .filter((item) => item.version || item.title)
          : []
        setReleaseNotes(releases)
        releaseNotesFetchedRef.current = true
      } catch (e) {
        setReleaseNotesError(
          e?.name === 'AbortError' ? 'github_timeout' : e?.message || 'release_notes_unavailable'
        )
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId)
        releaseNotesLoadingRef.current = false
        setReleaseNotesLoading(false)
      }
    },
    [t]
  )

  const openExternalLink = useCallback(
    (url) => {
      const target = String(url || '').trim()
      if (!target) return
      if (configRef.current.networkAccessDisabled === true) {
        alert(t('settings.networkDisabledStatus', 'Network access is disabled.'))
        return
      }
      if (window.api?.openExternal) {
        void window.api.openExternal(target)
        return
      }
      window.open(target, '_blank', 'noopener,noreferrer')
    },
    [t]
  )

  useEffect(() => {
    if ((view === 'settings' || releaseNotesOpen) && !releaseNotesFetchedRef.current) {
      void loadReleaseNotes()
    }
  }, [view, releaseNotesOpen, loadReleaseNotes])

  useEffect(() => {
    if (updateStatus?.event === 'update-available' || updateStatus?.event === 'update-downloaded') {
      void loadReleaseNotes()
    }
  }, [updateStatus, loadReleaseNotes])

  useEffect(() => {
    if (!libraryStateReady || !window.api?.setAutoUpdateEnabled) return
    void window.api.setAutoUpdateEnabled(config.autoUpdateEnabled !== false).catch(() => {})
  }, [libraryStateReady, config.autoUpdateEnabled])

  useEffect(() => {
    if (!libraryStateReady || !window.api?.setNetworkAccessDisabled) return
    void window.api.setNetworkAccessDisabled(config.networkAccessDisabled === true).catch(() => {})
  }, [libraryStateReady, config.networkAccessDisabled])

  useEffect(() => {
    if (!window.api?.onLyricsDesktopUncheck) return undefined
    return window.api.onLyricsDesktopUncheck(() => {
      setConfig((p) => ({ ...p, desktopLyricsEnabled: false }))
    })
  }, [setConfig])

  const persistQueueRef = useRef(new Map())
  const likedSet = useMemo(() => new Set(likedPaths), [likedPaths])
  const upNextPathSet = useMemo(
    () => new Set(upNextQueue.map((item) => item?.path).filter((x) => typeof x === 'string')),
    [upNextQueue]
  )
  const selectedSidebarTrackPathSet = useMemo(
    () => new Set(selectedSidebarTrackPaths),
    [selectedSidebarTrackPaths]
  )

  const flushPersistedState = useCallback((targetKey = null) => {
    const queue = persistQueueRef.current
    const keys = targetKey ? [targetKey] : Array.from(queue.keys())

    for (const persistKey of keys) {
      const pending = queue.get(persistKey)
      if (!pending) continue
      if (pending.timer) clearTimeout(pending.timer)
      queue.delete(persistKey)

      if (pending.localKey) {
        try {
          localStorage.setItem(pending.localKey, JSON.stringify(pending.value))
        } catch {
          /* ignore storage quota / serialization failures */
        }
      }

      if (pending.writeToAppState && window.api?.appStateSet) {
        void window.api.appStateSet(persistKey, pending.value)
      }
    }
  }, [])

  const persistStateImmediately = useCallback(
    (persistKey, localKey, value, writeToAppState = true) => {
      const queue = persistQueueRef.current
      const pending = queue.get(persistKey)
      if (pending?.timer) clearTimeout(pending.timer)
      queue.delete(persistKey)

      if (localKey) {
        try {
          localStorage.setItem(localKey, JSON.stringify(value))
        } catch {
          /* ignore storage quota / serialization failures */
        }
      }

      if (writeToAppState && window.api?.appStateSet) {
        void window.api.appStateSet(persistKey, value)
      }
    },
    []
  )

  const schedulePersistedState = useCallback(
    (persistKey, localKey, value, writeToAppState = true) => {
      const queue = persistQueueRef.current
      const existing = queue.get(persistKey)
      if (
        existing &&
        existing.value === value &&
        existing.localKey === localKey &&
        existing.writeToAppState === writeToAppState
      ) {
        return
      }

      if (existing?.timer) clearTimeout(existing.timer)

      const timer = window.setTimeout(() => {
        flushPersistedState(persistKey)
      }, RENDERER_PERSIST_DEBOUNCE_MS)

      queue.set(persistKey, {
        localKey,
        value,
        writeToAppState,
        timer
      })
    },
    [flushPersistedState]
  )

  const getPlaybackSessionSnapshot = useCallback(() => {
    const currentTrack = playlistRef.current[currentIndexRef.current]
    if (!currentTrack?.path) return null

    const pendingSession = pendingTrackStartRef.current
    const currentTimeSec =
      pendingSession?.trackPath === currentTrack.path
        ? pendingSession.currentTimeSec
        : lastLoadedTrackPathRef.current === currentTrack.path
          ? currentTimeRef.current
          : 0

    return {
      trackPath: currentTrack.path,
      currentTimeSec: Math.max(0, Number(currentTimeSec) || 0),
      playbackContext: normalizePlaybackContext(activePlaybackContextRef.current),
      savedAt: Date.now()
    }
  }, [])

  const persistPlaybackSession = useCallback(
    (value, writeToAppState = true) => {
      playbackSessionSeedRef.current = value
      schedulePersistedState('playbackSession', PLAYBACK_SESSION_LOCAL_KEY, value, writeToAppState)
    },
    [schedulePersistedState]
  )

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPersistedState()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      flushPersistedState()
    }
  }, [flushPersistedState])

  useEffect(() => {
    schedulePersistedState(
      'likedPaths',
      'nc_liked_paths',
      likedPaths,
      config.autoSaveLibrary !== false && likedPathsStoreHydratedRef.current
    )
  }, [likedPaths, config.autoSaveLibrary, schedulePersistedState])

  useEffect(() => {
    schedulePersistedState(
      'trackStats',
      'nc_track_stats',
      trackStats,
      config.autoSaveLibrary !== false && trackStatsStoreHydratedRef.current
    )
  }, [trackStats, config.autoSaveLibrary, schedulePersistedState])

  const commitTrackStatsStateSoon = useCallback((nextStats, { immediate = false } = {}) => {
    if (trackStatsCommitTimerRef.current) {
      window.clearTimeout(trackStatsCommitTimerRef.current)
      trackStatsCommitTimerRef.current = null
    }
    if (immediate) {
      setTrackStats(nextStats)
      return
    }
    trackStatsCommitTimerRef.current = window.setTimeout(() => {
      trackStatsCommitTimerRef.current = null
      setTrackStats(trackStatsRef.current)
    }, 8000)
  }, [])

  useEffect(() => {
    return () => {
      if (trackStatsCommitTimerRef.current) {
        window.clearTimeout(trackStatsCommitTimerRef.current)
        trackStatsCommitTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    schedulePersistedState(
      'upNextQueue',
      'nc_up_next_queue',
      upNextQueue.map((item) => ({ path: item.path })),
      upNextQueueStoreHydratedRef.current
    )
  }, [upNextQueue, schedulePersistedState])

  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    currentTimeRef.current = currentTime
    const safeCurrentTime = Math.max(0, Number(currentTime) || 0)
    playbackUiTimeFlushRef.current = {
      ...playbackUiTimeFlushRef.current,
      value: safeCurrentTime,
      second: Math.floor(safeCurrentTime)
    }
  }, [currentTime])

  const syncCurrentTimeFromNativeStatus = useCallback(
    (nextTimeValue) => {
      const nextTime = Math.max(0, Number(nextTimeValue) || 0)
      currentTimeRef.current = nextTime

      const now = Date.now()
      const previous = playbackUiTimeFlushRef.current || { at: 0, value: 0, second: 0 }
      const previousValue = Math.max(0, Number(previous.value) || 0)
      const nextSecond = Math.floor(nextTime)
      const minIntervalMs = lyricsTimingSurfaceActive
        ? PLAYBACK_UI_TIME_LYRICS_UPDATE_MS
        : libraryBrowserVisible
          ? miniPlayerWindowOpenRef.current
            ? PLAYBACK_UI_TIME_MINI_PLAYER_UPDATE_MS
            : PLAYBACK_UI_TIME_LIBRARY_BROWSER_UPDATE_MS
          : PLAYBACK_UI_TIME_UPDATE_MS
      const shouldFlush =
        previous.at === 0 ||
        (!libraryBrowserVisible &&
          Math.abs(nextTime - previousValue) >= PLAYBACK_UI_TIME_SEEK_DELTA_SEC) ||
        (nextSecond !== previous.second && now - previous.at >= minIntervalMs)

      if (!shouldFlush) return

      playbackUiTimeFlushRef.current = {
        at: now,
        value: nextTime,
        second: nextSecond
      }
      startTransition(() => {
        setCurrentTime(nextTime)
      })
    },
    [libraryBrowserVisible, lyricsTimingSurfaceActive]
  )

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    upNextQueueRef.current = upNextQueue
  }, [upNextQueue])

  useEffect(() => {
    playbackHistoryRef.current = playbackHistory
  }, [playbackHistory])

  useEffect(() => {
    setPlaybackHistory((prev) => {
      const collapsed = config.historyCollapseRepeats
        ? collapseConsecutiveHistoryEntries(prev)
        : prev
      const trimmed = trimPlaybackHistoryEntries(collapsed, config.historyMaxEntries)
      if (
        trimmed.length === prev.length &&
        trimmed.every((entry, index) => entry === prev[index])
      ) {
        return prev
      }
      playbackHistoryRef.current = trimmed
      return trimmed
    })
  }, [config.historyCollapseRepeats, config.historyMaxEntries])

  useEffect(() => {
    userPlaylistsRef.current = userPlaylists
  }, [userPlaylists])

  useEffect(() => {
    likedPathsRef.current = likedPaths
  }, [likedPaths])

  useEffect(() => {
    trackStatsRef.current = trackStats
  }, [trackStats])

  useEffect(() => {
    const needsLiveTrackStats =
      listMode === 'playlists' ||
      listMode === 'history' ||
      Boolean(selectedSmartCollectionId) ||
      songSortMode === 'frequentDesc'
    if (!needsLiveTrackStats) return
    if (trackStatsRef.current === trackStats) return
    commitTrackStatsStateSoon(trackStatsRef.current, { immediate: true })
  }, [commitTrackStatsStateSoon, listMode, selectedSmartCollectionId, songSortMode, trackStats])

  useEffect(() => {
    activePlaybackContextRef.current = activePlaybackContext
  }, [activePlaybackContext])

  const getLibraryPlaybackPaths = useCallback(() => {
    return dedupePathList((playlistRef.current || []).map((track) => track?.path))
  }, [])

  const getPlaybackSequenceSnapshot = useCallback(() => {
    return resolvePlaybackSequence({
      libraryPaths: getLibraryPlaybackPaths(),
      currentPath: playlistRef.current[currentIndexRef.current]?.path || '',
      playbackContext: activePlaybackContextRef.current
    })
  }, [getLibraryPlaybackPaths])

  useEffect(() => {
    trackMetaMapRef.current = trackMetaMap
  }, [trackMetaMap])

  const persistAlbumCoverCacheItems = useCallback((items) => {
    const entries = buildAlbumCoverCacheEntries(Array.isArray(items) ? items : [items])
    const freshEntries = {}
    for (const [key, entry] of Object.entries(entries)) {
      const cover = entry?.cover || ''
      const signature = `${key}\u0002${cover.length}\u0002${cover.slice(0, 80)}\u0002${cover.slice(-80)}`
      if (albumCoverCachePersistedEntriesRef.current.has(signature)) continue
      albumCoverCachePersistedEntriesRef.current.add(signature)
      freshEntries[key] = entry
    }
    if (albumCoverCachePersistedEntriesRef.current.size > ALBUM_COVER_PERSIST_SIGNATURE_LIMIT) {
      albumCoverCachePersistedEntriesRef.current.clear()
    }
    if (Object.keys(freshEntries).length > 0) {
      writeAlbumCoverCache(freshEntries).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!libraryStateReady || playlist.length === 0) return undefined
    const paths = [...new Set(playlist.map((track) => track?.path).filter(Boolean))]
    if (paths.length === 0) return undefined

    const hydrationKey = buildPathListFingerprint(paths)
    if (libraryMetaCacheHydrationKeyRef.current === hydrationKey) return undefined
    libraryMetaCacheHydrationKeyRef.current = hydrationKey

    let cancelled = false

    const mergeCachedEntries = (cachedEntries) => {
      const entries = Object.entries(cachedEntries || {})
      if (entries.length === 0) return

      setTrackMetaMap((prev) => {
        let changed = false
        const next = { ...prev }

        for (const [path, cachedEntry] of entries) {
          if (!cachedEntry) continue
          const current = next[path] || {}
          const merged = { ...cachedEntry, ...current }
          if (current.cover == null && cachedEntry.cover) {
            merged.cover = cachedEntry.cover
            merged.coverChecked = true
            delete merged.coverMemoryTrimmed
          }
          if (current.title == null && cachedEntry.title) merged.title = cachedEntry.title
          if (current.artist == null && cachedEntry.artist) merged.artist = cachedEntry.artist
          if (current.album == null && cachedEntry.album) merged.album = cachedEntry.album
          if (current.albumArtist == null && cachedEntry.albumArtist) {
            merged.albumArtist = cachedEntry.albumArtist
          }
          if (JSON.stringify(current) !== JSON.stringify(merged)) {
            next[path] = merged
            changed = true
          }
        }

        return changed ? trimTrackMetaCoverEntries(next, new Set(paths)) : prev
      })
    }

    const hydrateLibraryMetaCache = async () => {
      for (
        let index = 0;
        index < paths.length && !cancelled;
        index += LIBRARY_META_CACHE_HYDRATE_BATCH_SIZE
      ) {
        const chunk = paths.slice(index, index + LIBRARY_META_CACHE_HYDRATE_BATCH_SIZE)
        const cached = await readTrackMetaCache(chunk)
        if (cancelled) return
        mergeCachedEntries(cached)
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
    }

    hydrateLibraryMetaCache()

    return () => {
      cancelled = true
    }
  }, [libraryStateReady, playlist])

  useEffect(() => {
    displayMetadataOverridesRef.current = displayMetadataOverrides
  }, [displayMetadataOverrides])

  useEffect(() => {
    const syncModifier = (event) => {
      setQuickEditModifierActive(Boolean(event?.ctrlKey || event?.metaKey))
    }
    const clearModifier = () => setQuickEditModifierActive(false)

    window.addEventListener('keydown', syncModifier)
    window.addEventListener('keyup', syncModifier)
    window.addEventListener('blur', clearModifier)
    return () => {
      window.removeEventListener('keydown', syncModifier)
      window.removeEventListener('keyup', syncModifier)
      window.removeEventListener('blur', clearModifier)
    }
  }, [])

  useEffect(() => {
    if (!missingLibraryPaths.length) return
    const currentReferenced = new Set(
      collectReferencedLibraryPaths({
        playlist,
        userPlaylists,
        likedPaths,
        playbackHistory,
        trackStats
      })
    )
    setMissingLibraryPaths((prev) => {
      const next = prev.filter((path) => currentReferenced.has(path))
      return next.length === prev.length ? prev : next
    })
  }, [playlist, userPlaylists, likedPaths, playbackHistory, trackStats, missingLibraryPaths.length])

  useEffect(() => {
    const currentPath = playlist[currentIndex]?.path || ''
    const previousPath = lastHistoryTrackedPathRef.current

    if (!currentPath) {
      lastHistoryTrackedPathRef.current = ''
      lastStatsTrackedPathRef.current = ''
      return
    }

    if (isPlaying && lastStatsTrackedPathRef.current !== currentPath) {
      const current = trackStatsRef.current[currentPath] || {}
      const nextTrackStats = {
        ...trackStatsRef.current,
        [currentPath]: {
          playCount: (Number(current.playCount) || 0) + 1,
          lastPlayedAt: Date.now()
        }
      }
      trackStatsRef.current = nextTrackStats
      const needsLiveTrackStats =
        listMode === 'playlists' ||
        listMode === 'history' ||
        Boolean(selectedSmartCollectionId) ||
        songSortMode === 'frequentDesc'
      commitTrackStatsStateSoon(nextTrackStats, { immediate: needsLiveTrackStats })
      schedulePersistedState(
        'trackStats',
        'nc_track_stats',
        nextTrackStats,
        config.autoSaveLibrary !== false && trackStatsStoreHydratedRef.current
      )
      lastStatsTrackedPathRef.current = currentPath
    }

    lastHistoryTrackedPathRef.current = currentPath
    if (!previousPath || previousPath === currentPath) return

    if (historyNavigationRef.current) {
      historyNavigationRef.current = false
      return
    }

    setPlaybackHistory((prev) => {
      const previousTrack = playlist.find((track) => track?.path === previousPath)
      const nextEntry = buildPlaybackHistoryEntry(
        previousTrack,
        trackMetaMapRef.current,
        Date.now()
      ) || {
        path: previousPath,
        title: '',
        artist: '',
        album: '',
        playedAt: Date.now()
      }
      const next = [...prev, nextEntry]
      const collapsed = config.historyCollapseRepeats
        ? collapseConsecutiveHistoryEntries(next)
        : next
      return trimPlaybackHistoryEntries(collapsed, config.historyMaxEntries)
    })
  }, [
    commitTrackStatsStateSoon,
    config.autoSaveLibrary,
    config.historyCollapseRepeats,
    config.historyMaxEntries,
    currentIndex,
    isPlaying,
    listMode,
    playlist,
    schedulePersistedState,
    selectedSmartCollectionId,
    songSortMode
  ])

  const toggleLike = useCallback((path) => {
    if (!path) return
    setLikedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    )
  }, [])

  const enqueueUpNextTrack = useCallback((track) => {
    const path = track?.path
    if (!path) return { ok: false, reason: 'invalid_path' }
    let inserted = false
    setUpNextQueue((prev) => {
      if (prev.some((item) => item?.path === path)) return prev
      inserted = true
      return [...prev, { path }]
    })
    return inserted ? { ok: true } : { ok: false, reason: 'duplicate' }
  }, [])

  const enqueueUpNextTrackAtFront = useCallback((track) => {
    const path = track?.path
    if (!path) return { ok: false, reason: 'invalid_path' }
    let changed = false
    setUpNextQueue((prev) => {
      const filtered = prev.filter((item) => item?.path !== path)
      changed = filtered.length !== prev.length || filtered[0]?.path !== path
      return [{ path }, ...filtered]
    })
    return changed ? { ok: true } : { ok: false, reason: 'duplicate' }
  }, [])

  const enqueueUpNextTracks = useCallback((tracks) => {
    const validTracks = Array.isArray(tracks) ? tracks.filter((track) => track?.path) : []
    if (validTracks.length === 0) return { ok: false, reason: 'invalid_path' }

    let addedCount = 0
    setUpNextQueue((prev) => {
      const seen = new Set(prev.map((item) => item?.path).filter(Boolean))
      const next = [...prev]
      for (const track of validTracks) {
        if (seen.has(track.path)) continue
        seen.add(track.path)
        next.push({ path: track.path })
        addedCount += 1
      }
      return next
    })

    return addedCount > 0 ? { ok: true, addedCount } : { ok: false, reason: 'duplicate' }
  }, [])

  const removeTrackFromMainPlaylist = useCallback((path) => {
    const prev = playlistRef.current
    const ri = prev.findIndex((t) => t.path === path)
    if (ri === -1) return
    const next = prev.filter((t) => t.path !== path)
    const ci = currentIndexRef.current
    let newCi = ci
    if (next.length === 0) newCi = -1
    else if (ci === ri) newCi = Math.min(ri, next.length - 1)
    else if (ci > ri) newCi = ci - 1
    else newCi = ci
    setPlaylist(next)
    setUpNextQueue((prev) => prev.filter((item) => item?.path !== path))
    setPlaybackHistory((prev) => {
      const nextHistory = prev.filter((entry) => entry?.path !== path)
      playbackHistoryRef.current = nextHistory
      return nextHistory
    })
    setCurrentIndex(newCi)
    if (next.length === 0) setIsPlaying(false)
  }, [])

  const removeFromUpNextQueue = useCallback((path) => {
    if (!path) return
    setUpNextQueue((prev) => prev.filter((item) => item?.path !== path))
  }, [])

  const pushQueueUndoSnapshot = useCallback((prevQueue) => {
    const snapshot = Array.isArray(prevQueue) ? prevQueue.map((item) => ({ path: item.path })) : []
    if (snapshot.length === 0) return
    setQueueUndoStack((prev) => [{ queue: snapshot, savedAt: Date.now() }, ...prev].slice(0, 5))
  }, [])

  const removeFromUpNextQueueWithUndo = useCallback(
    (path) => {
      if (!path) return
      setUpNextQueue((prev) => {
        if (!prev.some((item) => item?.path === path)) return prev
        pushQueueUndoSnapshot(prev)
        return prev.filter((item) => item?.path !== path)
      })
    },
    [pushQueueUndoSnapshot]
  )

  const removeManyFromUpNextQueueWithUndo = useCallback(
    (paths) => {
      const pathSet = new Set((Array.isArray(paths) ? paths : []).filter(Boolean))
      if (pathSet.size === 0) return
      setUpNextQueue((prev) => {
        if (!prev.some((item) => pathSet.has(item?.path))) return prev
        pushQueueUndoSnapshot(prev)
        return prev.filter((item) => !pathSet.has(item?.path))
      })
    },
    [pushQueueUndoSnapshot]
  )

  const clearUpNextQueueWithUndo = useCallback(() => {
    setUpNextQueue((prev) => {
      if (prev.length === 0) return prev
      pushQueueUndoSnapshot(prev)
      return []
    })
  }, [pushQueueUndoSnapshot])

  const undoQueueMutation = useCallback(() => {
    setQueueUndoStack((prev) => {
      const [entry, ...rest] = prev
      if (entry?.queue) setUpNextQueue(entry.queue)
      return rest
    })
  }, [])

  const applyLibraryFolderDelta = useCallback((payload) => {
    const renamed = Array.isArray(payload?.renamed)
      ? payload.renamed.filter(
          (item) =>
            item &&
            typeof item.from === 'string' &&
            item.from &&
            typeof item.to === 'string' &&
            item.to
        )
      : []
    const removedPaths = Array.isArray(payload?.removedPaths)
      ? payload.removedPaths.filter((item) => typeof item === 'string' && item)
      : []
    const addedTracks = Array.isArray(payload?.added)
      ? payload.added.map(normalizeWatchedTrack).filter(Boolean)
      : []

    if (!renamed.length && !removedPaths.length && !addedTracks.length) return

    const pathMap = Object.fromEntries(renamed.map((item) => [item.from, item.to]))
    const removedSet = new Set(removedPaths)

    remapLyricsOverrides(pathMap, removedPaths)
    remapMvOverrides(pathMap, removedPaths)

    const nextTrackStats = remapTrackStatsEntries(trackStatsRef.current, pathMap, removedSet)
    trackStatsRef.current = nextTrackStats
    setTrackStats(nextTrackStats)

    const nextTrackMetaMap = remapTrackMetaEntries(trackMetaMapRef.current, pathMap, removedSet)
    trackMetaMapRef.current = nextTrackMetaMap
    setTrackMetaMap(nextTrackMetaMap)

    const nextDisplayMetadataOverrides = remapTrackMetaEntries(
      displayMetadataOverridesRef.current,
      pathMap,
      removedSet
    )
    displayMetadataOverridesRef.current = nextDisplayMetadataOverrides
    setDisplayMetadataOverrides(nextDisplayMetadataOverrides)

    const nextLikedPaths = remapPathList(likedPathsRef.current, pathMap, removedSet)
    likedPathsRef.current = nextLikedPaths
    setLikedPaths(nextLikedPaths)

    const nextUserPlaylists = (userPlaylistsRef.current || []).map((playlistItem) => ({
      ...playlistItem,
      paths: remapPathList(playlistItem?.paths || [], pathMap, removedSet)
    }))
    userPlaylistsRef.current = nextUserPlaylists
    setUserPlaylists(nextUserPlaylists)

    const nextUpNextQueue = remapQueueItems(upNextQueueRef.current, pathMap, removedSet)
    upNextQueueRef.current = nextUpNextQueue
    setUpNextQueue(nextUpNextQueue)

    const nextPlaybackHistory = remapPlaybackHistoryEntries(
      playbackHistoryRef.current,
      pathMap,
      removedSet,
      normalizeHistoryMaxEntries(configRef.current?.historyMaxEntries)
    )
    playbackHistoryRef.current = nextPlaybackHistory
    setPlaybackHistory(nextPlaybackHistory)

    const savedSession = playbackSessionSeedRef.current
    if (savedSession?.trackPath) {
      const mappedSessionPath = pathMap[savedSession.trackPath] || savedSession.trackPath
      playbackSessionSeedRef.current =
        !mappedSessionPath || removedSet.has(mappedSessionPath)
          ? null
          : {
              ...savedSession,
              trackPath: mappedSessionPath
            }
    }

    const previousPlaylist = playlistRef.current
    const previousCurrentIndex = currentIndexRef.current
    const previousCurrentPath = previousPlaylist[previousCurrentIndex]?.path || ''
    const nextPlaylist = []
    const seenPaths = new Set()

    for (const track of previousPlaylist) {
      const oldPath = track?.path
      if (!oldPath || removedSet.has(oldPath)) continue
      const nextPath = pathMap[oldPath] || oldPath
      if (!nextPath || removedSet.has(nextPath) || seenPaths.has(nextPath)) continue
      seenPaths.add(nextPath)
      nextPlaylist.push(withUpdatedTrackPath(track, nextPath))
    }

    for (const track of addedTracks) {
      if (!track?.path || seenPaths.has(track.path)) continue
      seenPaths.add(track.path)
      nextPlaylist.push(track)
    }

    let nextCurrentIndex = -1
    if (previousCurrentPath) {
      const preferredPath = removedSet.has(previousCurrentPath)
        ? pathMap[previousCurrentPath] || ''
        : pathMap[previousCurrentPath] || previousCurrentPath

      if (preferredPath) {
        nextCurrentIndex = nextPlaylist.findIndex((track) => track.path === preferredPath)
      }

      if (nextCurrentIndex === -1 && nextPlaylist.length > 0) {
        nextCurrentIndex = Math.min(previousCurrentIndex, nextPlaylist.length - 1)
      }
    }

    if (nextPlaylist.length === 0) {
      nextCurrentIndex = -1
    }

    playlistRef.current = nextPlaylist
    currentIndexRef.current = nextCurrentIndex
    setPlaylist(nextPlaylist)
    setCurrentIndex(nextCurrentIndex)

    if (previousCurrentPath && pathMap[previousCurrentPath]) {
      lastHistoryTrackedPathRef.current = pathMap[previousCurrentPath]
      if (lastStatsTrackedPathRef.current === previousCurrentPath) {
        lastStatsTrackedPathRef.current = pathMap[previousCurrentPath]
      }
    } else if (previousCurrentPath && removedSet.has(previousCurrentPath)) {
      lastHistoryTrackedPathRef.current = nextPlaylist[nextCurrentIndex]?.path || ''
      if (lastStatsTrackedPathRef.current === previousCurrentPath) {
        lastStatsTrackedPathRef.current = nextPlaylist[nextCurrentIndex]?.path || ''
      }
      setIsPlaying(false)
    }
  }, [])

  const scanMissingLibraryPaths = useCallback(async () => {
    if (!window.api?.batchExistsHandler) return []

    const referencedPaths = collectReferencedLibraryPaths({
      playlist: playlistRef.current,
      userPlaylists: userPlaylistsRef.current,
      likedPaths: likedPathsRef.current,
      playbackHistory: playbackHistoryRef.current,
      trackStats: trackStatsRef.current
    })

    if (!referencedPaths.length) {
      setMissingLibraryPaths([])
      return []
    }

    setLibraryCleanupBusy(true)
    try {
      const missing = []
      for (let i = 0; i < referencedPaths.length; i += 200) {
        const batch = referencedPaths.slice(i, i + 200)
        const result = await window.api.batchExistsHandler(batch)
        for (const path of batch) {
          if (result?.[path] === false) missing.push(path)
        }
      }
      setMissingLibraryPaths(missing)
      return missing
    } finally {
      setLibraryCleanupBusy(false)
    }
  }, [])

  const cleanupMissingLibraryPaths = useCallback(async () => {
    const missing = missingLibraryPaths.length
      ? missingLibraryPaths
      : await scanMissingLibraryPaths()
    if (!missing.length) return
    applyLibraryFolderDelta({ renamed: [], removedPaths: missing, added: [] })
    setMissingLibraryPaths([])
  }, [applyLibraryFolderDelta, missingLibraryPaths, scanMissingLibraryPaths])

  useEffect(() => {
    if (playlist.length === 0) {
      setUpNextQueue((prev) => (prev.length ? [] : prev))
      return
    }
    const pathSet = new Set(playlist.map((item) => item.path))
    setUpNextQueue((prev) => {
      const filtered = prev.filter((item) => item?.path && pathSet.has(item.path))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [playlist])

  useEffect(() => {
    const loc = normalizeUiLocale(config.uiLocale)
    i18n.changeLanguage(loc)
    document.documentElement.lang = bcp47ForUiLocale(loc)
  }, [config.uiLocale])

  useEffect(() => {
    playlistStoreHydratedRef.current = true
    userPlaylistsStoreHydratedRef.current = true
    userSmartCollectionsStoreHydratedRef.current = true
    displayMetadataOverridesHydratedRef.current = true
    configStoreHydratedRef.current = true
    likedPathsStoreHydratedRef.current = true
    upNextQueueStoreHydratedRef.current = true
    trackStatsStoreHydratedRef.current = true
    importedFoldersHydratedRef.current = true
    playModeStoreHydratedRef.current = true
    queuePlaybackStoreHydratedRef.current = true
    playbackHistoryStoreHydratedRef.current = true
    volumeStoreHydratedRef.current = true
    setLibraryStateReady(true)
  }, [])

  useEffect(() => {
    if (!libraryStateReady || startupExclusiveResetRef.current) return
    startupExclusiveResetRef.current = true
    if (config.audioExclusiveResetOnStartup === false) return
    setIsAudioExclusive(false)
    if (window.api?.setAudioExclusive) {
      void window.api.setAudioExclusive(false)
    }
    setConfig((prev) => (prev.audioExclusive === false ? prev : { ...prev, audioExclusive: false }))
  }, [libraryStateReady, config.audioExclusiveResetOnStartup])

  useEffect(() => {
    if (!libraryStateReady) return
    if (config.lastfmEnabled && config.lastfmSessionKey && window.api?.lastfm) {
      void window.api.lastfm.setSession(config.lastfmSessionKey, config.lastfmUsername || '')
    }
  }, [libraryStateReady, config.lastfmEnabled, config.lastfmSessionKey, config.lastfmUsername])

  useEffect(() => {
    const snapshotHistory = getInitialAppStateValue('playbackHistory')
    const localHistory = readStoredJson('nc_playback_history')
    const loadedHistory = snapshotHistory ?? localHistory
    if (containsLegacyPlaybackHistoryEntries(loadedHistory)) {
      console.info('[PlaybackHistory] Loaded legacy string[] history and upgraded it in memory')
    }
  }, [])

  useEffect(() => {
    if (!libraryStateReady || playbackSessionRestoreAttemptedRef.current) return
    playbackSessionRestoreAttemptedRef.current = true

    const savedSession = playbackSessionSeedRef.current
    if (!savedSession) {
      console.info('[PlaybackSession] No saved playback session to restore')
      setPlaybackSessionRestoreReady(true)
      return
    }

    const nextIndex = playlist.findIndex((track) => track?.path === savedSession.trackPath)
    if (nextIndex === -1) {
      console.warn(
        `[PlaybackSession] Saved track no longer exists, clearing session for ${savedSession.trackPath}`
      )
      playbackSessionSeedRef.current = null
      if (window.api?.appStateSet) {
        void window.api.appStateSet('playbackSession', null)
      }
      setPlaybackSessionRestoreReady(true)
      return
    }

    pendingTrackStartRef.current = savedSession
    setActivePlaybackContext(normalizePlaybackContext(savedSession.playbackContext))
    setCurrentTime(Math.max(0, savedSession.currentTimeSec || 0))
    setCurrentIndex(nextIndex)
    setIsPlaying(false)
    console.info(
      `[PlaybackSession] Restored paused session for ${savedSession.trackPath} at ${Math.max(
        0,
        savedSession.currentTimeSec || 0
      ).toFixed(2)}s`
    )
    setPlaybackSessionRestoreReady(true)
  }, [libraryStateReady, playlist])

  useEffect(() => {
    if (
      !config.devModeEnabled ||
      !config.devOpenDevToolsOnStartup ||
      !window.api?.dev?.openDevTools
    ) {
      return undefined
    }
    const id = window.setTimeout(() => {
      window.api.dev.openDevTools()
    }, 500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const themeBackdropStyle = useMemo(() => {
    const raw =
      config.themeDynamicCoverColor && dynamicCoverTheme
        ? dynamicCoverTheme
        : config.theme === 'custom' && config.customColors
          ? config.customColors
          : PRESET_THEMES[config.theme]?.colors || PRESET_THEMES.minimal.colors
    return getAppThemeBackgroundStyle(raw, false)
  }, [config.theme, config.customColors, config.themeDynamicCoverColor, dynamicCoverTheme])

  const activeAccentHex = useMemo(() => {
    const raw =
      config.themeDynamicCoverColor && dynamicCoverTheme
        ? dynamicCoverTheme
        : config.theme === 'custom' && config.customColors
          ? config.customColors
          : PRESET_THEMES[config.theme]?.colors || PRESET_THEMES.minimal.colors
    return normalizeThemeColors(raw).accent1
  }, [config.theme, config.customColors, config.themeDynamicCoverColor, dynamicCoverTheme])

  const customThemePreviewBg = useMemo(() => {
    const c = normalizeThemeColors(config.customColors || PRESET_THEMES.minimal.colors)
    return `linear-gradient(135deg, ${c.accent1}, ${c.accent2}, ${c.accent3})`
  }, [config.customColors])

  const handleResetAllConfig = () => {
    if (confirm(t('settings.resetConfirm'))) {
      setConfig(DEFAULT_CONFIG)
      localStorage.removeItem('nc_config')
      localStorage.removeItem(STORED_VOLUME_KEY)
      setVolume(1)
    }
  }

  const handleResetThemeConfig = () => {
    if (!confirm(t('settings.resetThemeConfirm'))) return

    setConfig((prev) => ({
      ...prev,
      // Theme / appearance related settings only
      theme: DEFAULT_CONFIG.theme,
      customColors: DEFAULT_CONFIG.customColors,
      customBgPath: DEFAULT_CONFIG.customBgPath,
      customBgOpacity: DEFAULT_CONFIG.customBgOpacity,
      uiBgOpacity: DEFAULT_CONFIG.uiBgOpacity,
      uiBlur: DEFAULT_CONFIG.uiBlur,
      uiFontFamily: DEFAULT_CONFIG.uiFontFamily,
      uiCjkFontFamily: DEFAULT_CONFIG.uiCjkFontFamily,
      uiCustomFontPath: DEFAULT_CONFIG.uiCustomFontPath,
      uiCjkCustomFontPath: DEFAULT_CONFIG.uiCjkCustomFontPath,
      uiBaseFontSize: DEFAULT_CONFIG.uiBaseFontSize,
      uiRadiusScale: DEFAULT_CONFIG.uiRadiusScale,
      uiShadowIntensity: DEFAULT_CONFIG.uiShadowIntensity,
      uiSaturation: DEFAULT_CONFIG.uiSaturation,
      uiLineHeightScale: DEFAULT_CONFIG.uiLineHeightScale,
      uiControlDensity: DEFAULT_CONFIG.uiControlDensity,
      uiAccentBackgroundGlow: DEFAULT_CONFIG.uiAccentBackgroundGlow,
      ultraSmallScreenAdaptive: DEFAULT_CONFIG.ultraSmallScreenAdaptive,
      showTitlebarCastSender: DEFAULT_CONFIG.showTitlebarCastSender,
      showTitlebarListenTogether: DEFAULT_CONFIG.showTitlebarListenTogether,
      showTitlebarPlugins: DEFAULT_CONFIG.showTitlebarPlugins,
      lyricsReadabilityEnhancement: DEFAULT_CONFIG.lyricsReadabilityEnhancement,
      playerCoverSize: DEFAULT_CONFIG.playerCoverSize
    }))
  }

  const handleResetTypographyConfig = () => {
    if (
      !confirm(
        t(
          'settings.resetTypographyConfirm',
          '\u786e\u5b9a\u8981\u5c06\u5b57\u4f53\u3001\u5bc6\u5ea6\u3001\u5706\u89d2\u3001\u9634\u5f71\u4e0e\u4e13\u8f91\u4e3b\u9898\u8272\u53c2\u6570\u6062\u590d\u9ed8\u8ba4\u5417\uff1f'
        )
      )
    ) {
      return
    }

    setConfig((prev) => ({
      ...prev,
      uiFontFamily: DEFAULT_CONFIG.uiFontFamily,
      uiCjkFontFamily: DEFAULT_CONFIG.uiCjkFontFamily,
      uiCustomFontPath: DEFAULT_CONFIG.uiCustomFontPath,
      uiCjkCustomFontPath: DEFAULT_CONFIG.uiCjkCustomFontPath,
      uiBaseFontSize: DEFAULT_CONFIG.uiBaseFontSize,
      uiRadiusScale: DEFAULT_CONFIG.uiRadiusScale,
      uiShadowIntensity: DEFAULT_CONFIG.uiShadowIntensity,
      uiSaturation: DEFAULT_CONFIG.uiSaturation,
      uiLineHeightScale: DEFAULT_CONFIG.uiLineHeightScale,
      uiControlDensity: DEFAULT_CONFIG.uiControlDensity,
      ultraSmallScreenAdaptive: DEFAULT_CONFIG.ultraSmallScreenAdaptive,
      themeDynamicCoverColor: DEFAULT_CONFIG.themeDynamicCoverColor,
      themeCoverAsBackground: DEFAULT_CONFIG.themeCoverAsBackground,
      showTitlebarCastSender: DEFAULT_CONFIG.showTitlebarCastSender,
      showTitlebarListenTogether: DEFAULT_CONFIG.showTitlebarListenTogether,
      showTitlebarPlugins: DEFAULT_CONFIG.showTitlebarPlugins,
      lyricsReadabilityEnhancement: DEFAULT_CONFIG.lyricsReadabilityEnhancement
    }))
  }

  const handleExportSettingsConfig = useCallback(async () => {
    if (!window.api?.saveSettingsJsonHandler) return
    const date = new Date().toISOString().slice(0, 10)
    const bundle = buildSettingsExportBundle(configRef.current, { appVersion })
    const json = JSON.stringify(bundle, null, 2)
    const result = await window.api.saveSettingsJsonHandler(
      json,
      `echo-settings-${date}.json`,
      configRef.current.uiLocale
    )
    if (result && result.success === false && result.error) {
      alert(result.error)
    }
  }, [appVersion])

  const handleImportSettingsConfig = useCallback(async () => {
    if (!window.api?.openSettingsJsonHandler) return
    if (
      !confirm(
        t(
          'settings.importConfigConfirm',
          '\u5bfc\u5165\u540e\u4f1a\u8986\u76d6\u5f53\u524d\u8bbe\u7f6e\uff0c\u786e\u5b9a\u7ee7\u7eed\uff1f'
        )
      )
    ) {
      return
    }

    const result = await window.api.openSettingsJsonHandler(configRef.current.uiLocale)
    if (!result) return
    if (result.error) {
      alert(result.error)
      return
    }

    try {
      const importedConfig = parseSettingsImportText(result.content)
      const normalized = normalizeConfigState(importedConfig)
      setConfig(normalized)
      if (normalized.lastfmSessionKey && window.api?.lastfm?.setSession) {
        void window.api.lastfm.setSession(
          normalized.lastfmSessionKey,
          normalized.lastfmUsername || ''
        )
      }
    } catch (error) {
      alert(error?.message || String(error))
    }
  }, [t])

  const pickUiCustomFont = useCallback(async () => {
    if (!window.api?.openFontFileHandler) return
    const path = await window.api.openFontFileHandler(configRef.current.uiLocale)
    if (!path) return
    setConfig((prev) => ({
      ...prev,
      uiFontFamily: 'custom',
      uiCustomFontPath: path
    }))
  }, [])

  const pickUiCjkCustomFont = useCallback(async () => {
    if (!window.api?.openFontFileHandler) return
    const path = await window.api.openFontFileHandler(configRef.current.uiLocale)
    if (!path) return
    setConfig((prev) => ({
      ...prev,
      uiCjkFontFamily: 'custom',
      uiCjkCustomFontPath: path
    }))
  }, [])

  useEffect(() => {
    if (!configStoreHydratedRef.current) return
    persistStateImmediately('config', 'nc_config', config, true)
  }, [config, persistStateImmediately])

  useEffect(() => {
    const root = document.documentElement

    let rawTheme = PRESET_THEMES.minimal.colors
    if (config.themeDynamicCoverColor && dynamicCoverTheme) {
      rawTheme = dynamicCoverTheme
    } else if (config.theme === 'custom' && config.customColors) {
      rawTheme = config.customColors
    } else if (PRESET_THEMES[config.theme]) {
      rawTheme = PRESET_THEMES[config.theme].colors
    }
    const activeTheme = normalizeThemeColors(rawTheme)

    root.style.setProperty('--bg-color', activeTheme.bgColor)
    root.style.setProperty('--bg-gradient-end', activeTheme.bgGradientEnd)
    root.style.setProperty('--bg-gradient-angle', `${activeTheme.bgGradientAngle}deg`)
    root.style.setProperty('--accent-pink', activeTheme.accent1)
    root.style.setProperty('--accent-blue', activeTheme.accent2)
    root.style.setProperty('--accent-mint', activeTheme.accent3)
    root.style.setProperty('--text-main', activeTheme.textMain)
    root.style.setProperty('--text-soft', activeTheme.textSoft)

    const faceId = 'echoes-ui-user-font-face'
    const faceCss = buildUiCustomFontFaceCss(config.uiCustomFontPath)
    let faceEl = document.getElementById(faceId)
    if (faceCss) {
      if (!faceEl) {
        faceEl = document.createElement('style')
        faceEl.id = faceId
        document.head.appendChild(faceEl)
      }
      faceEl.textContent = faceCss
    } else if (faceEl) {
      faceEl.remove()
    }
    const cjkFaceId = 'echoes-ui-user-cjk-font-face'
    const cjkFaceCss = buildUiCustomFontFaceCss(
      config.uiCjkCustomFontPath,
      UI_CJK_CUSTOM_FONT_FAMILY
    )
    let cjkFaceEl = document.getElementById(cjkFaceId)
    if (cjkFaceCss) {
      if (!cjkFaceEl) {
        cjkFaceEl = document.createElement('style')
        cjkFaceEl.id = cjkFaceId
        document.head.appendChild(cjkFaceEl)
      }
      cjkFaceEl.textContent = cjkFaceCss
    } else if (cjkFaceEl) {
      cjkFaceEl.remove()
    }
    root.style.setProperty('--font-family-main', getUiFontStack(config))

    const baseFs = config.uiBaseFontSize ?? 15
    root.style.fontSize = `${baseFs}px`
    const lineHeightScale = Number(config.uiLineHeightScale ?? 1)
    const uiLineHeight = Number.isFinite(lineHeightScale)
      ? Math.max(0.9, Math.min(1.25, lineHeightScale))
      : 1
    const controlDensity = Number(config.uiControlDensity ?? 1)
    const uiDensity = Number.isFinite(controlDensity)
      ? Math.max(0.85, Math.min(1.15, controlDensity))
      : 1
    root.style.setProperty('--ui-line-height-scale', String(uiLineHeight))
    root.style.setProperty('--ui-control-density', String(uiDensity))
    document.body.style.lineHeight = String(1.45 * uiLineHeight)
    const playerCoverSize = Math.max(180, Math.min(360, Number(config.playerCoverSize ?? 360)))
    root.style.setProperty('--player-cover-size', `${playerCoverSize}px`)

    const rs = config.uiRadiusScale ?? 1
    root.style.setProperty('--border-radius-lg', `${20 * rs}px`)
    root.style.setProperty('--border-radius-md', `${14 * rs}px`)
    root.style.setProperty('--border-radius-sm', `${8 * rs}px`)

    const uiOpa = normalizeUnitOpacity(config.uiBgOpacity, DEFAULT_CONFIG.uiBgOpacity ?? 0.6)
    const uiBlurRaw = Number(
      config.uiBlur !== undefined ? config.uiBlur : (DEFAULT_CONFIG.uiBlur ?? 20)
    )
    const uiBlur = Number.isFinite(uiBlurRaw)
      ? Math.max(0, uiBlurRaw)
      : (DEFAULT_CONFIG.uiBlur ?? 20)
    const glassOpacityClear = uiOpa <= 0.051
    const glassBlurClear = uiBlur <= 0.001 || glassOpacityClear
    const glassFullyClear = glassOpacityClear && glassBlurClear
    const glassRgbStr = hexToRgbStr(activeTheme.glassColor || '#ffffff')

    root.style.setProperty('--glass-bg', `rgba(${glassRgbStr}, ${uiOpa})`)
    root.style.setProperty(
      '--glass-border',
      `rgba(${glassRgbStr}, ${glassFullyClear ? 0 : Math.min(uiOpa + 0.2, 1)})`
    )
    root.style.setProperty('--glass-blur', `${uiBlur}px`)
    if (glassOpacityClear) {
      root.dataset.echoGlassTransparent = 'true'
    } else {
      delete root.dataset.echoGlassTransparent
    }
    if (glassBlurClear) {
      root.dataset.echoGlassBlur = 'off'
    } else {
      delete root.dataset.echoGlassBlur
    }
    if (glassFullyClear) {
      root.dataset.echoGlassClear = 'true'
    } else {
      delete root.dataset.echoGlassClear
    }

    const lyricLegacyColor = config.lyricsFontColor
    if (typeof lyricLegacyColor === 'string' && lyricLegacyColor.trim()) {
      root.style.setProperty('--lyrics-user-color', lyricLegacyColor.trim())
    } else {
      root.style.removeProperty('--lyrics-user-color')
    }

    const setLyricVar = (name, v) => {
      if (v && typeof v.hex === 'string' && v.hex.trim()) {
        const a = typeof v.a === 'number' ? Math.min(1, Math.max(0, v.a)) : 1
        root.style.setProperty(name, hexToRgbaString(v.hex.trim(), a))
      } else {
        root.style.removeProperty(name)
      }
    }

    const lc = config.lyricsColor
    if (lc && typeof lc === 'object' && lc.layers && typeof lc.layers === 'object') {
      const layers = ['main', 'karaoke', 'romaji', 'translation']
      const states = ['active', 'normal']
      for (const layer of layers) {
        for (const st of states) {
          setLyricVar(`--lyrics-${layer}-${st}`, lc.layers?.[layer]?.[st] || null)
        }
      }
    } else {
      // Ensure old vars cleared when user resets panel.
      const layers = ['main', 'karaoke', 'romaji', 'translation']
      const states = ['active', 'normal']
      for (const layer of layers) {
        for (const st of states) root.style.removeProperty(`--lyrics-${layer}-${st}`)
      }
    }

    const isDark =
      activeTheme.glassColor !== '#ffffff' &&
      parseInt(String(glassRgbStr).split(',')[0].trim(), 10) < 100
    root.dataset.echoThemeTone = isDark ? 'dark' : 'light'
    root.style.setProperty('color-scheme', isDark ? 'dark' : 'light')

    const shadowMul = config.uiShadowIntensity ?? 1
    const baseA = isDark ? 0.4 : 0.2
    root.style.setProperty(
      '--shadow-color',
      isDark
        ? `rgba(0, 0, 0, ${Math.min(0.62, baseA * shadowMul)})`
        : `rgba(200, 180, 190, ${Math.min(0.42, baseA * shadowMul)})`
    )

    root.style.setProperty(
      '--surface-elevated',
      isDark ? 'rgba(255, 255, 255, 0.085)' : 'rgba(255, 255, 255, 0.45)'
    )

    const sat = config.uiSaturation ?? 1
    root.style.filter = sat !== 1 && sat > 0 ? `saturate(${sat})` : ''
  }, [config, dynamicCoverTheme])

  const audioRef = useRef(new Audio())
  const listenTogetherSyncRef = useRef({
    trackId: '',
    streamUrl: '',
    isPlaying: null,
    lastSeekAt: 0
  })
  const playbackRateRef = useRef(playbackRate)

  const scheduleNativeSilentSwitchRecovery = useCallback((trackPath, reason = 'native-switch') => {
    if (!trackPath || !window.api?.playAudio) return

    if (nativeSilentSwitchRecoveryTimerRef.current) {
      window.clearTimeout(nativeSilentSwitchRecoveryTimerRef.current)
    }

    const scheduledStatus = latestNativeAudioStatusRef.current || {}
    const scheduledStatusTime =
      scheduledStatus.filePath === trackPath ? Number(scheduledStatus.currentTime) : NaN

    nativeSilentSwitchRecoveryTimerRef.current = window.setTimeout(() => {
      nativeSilentSwitchRecoveryTimerRef.current = 0
      const activePath = playlistRef.current[currentIndexRef.current]?.path || ''
      if (activePath !== trackPath || !isPlayingRef.current || !useNativeEngineRef.current) return

      const status = latestNativeAudioStatusRef.current || {}
      const statusPath = status.filePath || ''
      const statusPlaying = status.isPlaying === true
      const statusTime = Number(status.currentTime)
      const hasStatusProgress =
        statusPath === trackPath &&
        statusPlaying &&
        Number.isFinite(statusTime) &&
        (Number.isFinite(scheduledStatusTime)
          ? statusTime > scheduledStatusTime + 0.15
          : statusTime > 0.15)

      if (hasStatusProgress) return

      const resumeAt = Math.max(0, Number(currentTimeRef.current) || 0)
      nativeSilentTrackSwitchRef.current = ''
      nativePlayDedupeRef.current = { path: '', index: -1, t: 0 }
      console.warn('[App] Recovering silent native track switch', {
        reason,
        trackPath,
        statusPath,
        statusPlaying,
        statusTime
      })
      window.api
        .playAudio(trackPath, resumeAt, playbackRateRef.current)
        .catch((e) => console.error('[App] Native silent switch recovery failed:', e))
    }, 900)
  }, [])

  useEffect(() => {
    return () => {
      if (nativeSilentSwitchRecoveryTimerRef.current) {
        window.clearTimeout(nativeSilentSwitchRecoveryTimerRef.current)
        nativeSilentSwitchRecoveryTimerRef.current = 0
      }
    }
  }, [])

  // Web Audio Refs
  const audioContext = useRef(null)
  const sourceNode = useRef(null)
  const analyserNode = useRef(null)
  const gainNode = useRef(null)
  const preampNode = useRef(null)
  const eqFilters = useRef([])

  // Initialize Web Audio
  const initAudioContext = useCallback(() => {
    if (audioContext.current) return

    const Context = window.AudioContext || window.webkitAudioContext
    const ctx = new Context()
    audioContext.current = ctx

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024 // 512 bins; enough for EQ RTA without extra renderer cost.
    analyser.smoothingTimeConstant = 0.72
    analyserNode.current = analyser

    const gain = ctx.createGain()
    gainNode.current = gain

    const preamp = ctx.createGain()
    preamp.gain.value = Math.pow(10, (config.preamp || 0) / 20)
    preampNode.current = preamp

    // Create Parametric EQ chain
    const filters = effectiveEqBands.map((band) => {
      const filter = ctx.createBiquadFilter()
      const bandActive = config.useEQ && band.enabled !== false
      filter.type = bandActive ? band.type : 'peaking'
      filter.frequency.value = band.freq
      filter.Q.value = clampBiquadQ(band.type, band.q)
      filter.gain.value = bandActive ? band.gain : 0
      return filter
    })
    eqFilters.current = filters

    const source = ctx.createMediaElementSource(audioRef.current)
    sourceNode.current = source

    // Connect chain: Source -> Preamp -> EQ... -> Analyser -> Gain -> Destination
    source.connect(preamp)
    let lastNode = preamp
    filters.forEach((f) => {
      lastNode.connect(f)
      lastNode = f
    })

    lastNode.connect(analyser)
    analyser.connect(gain)
    gain.connect(ctx.destination)

    if (useNativeEngineRef.current) {
      gain.gain.value = 0
    }
  }, [config.useEQ, effectiveEqBands, config.preamp])

  useEffect(() => {
    // Update EQ Filters in real-time
    const now = audioContext.current?.currentTime || 0
    if (preampNode.current) {
      preampNode.current.gain.setTargetAtTime(Math.pow(10, (config.preamp || 0) / 20), now, 0.05)
    }
    if (eqFilters.current.length > 0 && eqFilters.current.length === effectiveEqBands.length) {
      eqFilters.current.forEach((filter, i) => {
        const band = effectiveEqBands[i]
        const bandActive = config.useEQ && band.enabled !== false
        const filterType = bandActive ? band.type : 'peaking'
        if (filter.type !== filterType) filter.type = filterType
        filter.frequency.setTargetAtTime(band.freq, now, 0.05)
        filter.Q.setTargetAtTime(clampBiquadQ(band.type, band.q), now, 0.05)
        filter.gain.setTargetAtTime(bandActive ? band.gain : 0, now, 0.05)
      })
    }
  }, [effectiveEqBands, config.useEQ, config.preamp])

  useEffect(() => {
    const ctx = audioContext.current
    const preamp = preampNode.current
    const analyser = analyserNode.current
    if (!ctx || !preamp || !analyser || !sourceNode.current) return

    const bands = effectiveEqBands
    if (eqFilters.current.length === bands.length) return

    preamp.disconnect()
    for (const f of eqFilters.current) {
      try {
        f.disconnect()
      } catch {
        /* node may already be GC'd */
      }
    }

    const useEQ = configRef.current.useEQ
    const filters = bands.map((band) => {
      const filter = ctx.createBiquadFilter()
      const bandActive = useEQ && band.enabled !== false
      filter.type = bandActive ? band.type : 'peaking'
      filter.frequency.value = band.freq
      filter.Q.value = clampBiquadQ(band.type, band.q)
      filter.gain.value = bandActive ? band.gain : 0
      return filter
    })
    eqFilters.current = filters

    let lastNode = preamp
    filters.forEach((f) => {
      lastNode.connect(f)
      lastNode = f
    })
    lastNode.connect(analyser)
  }, [effectiveEqBands])

  useEffect(() => {
    const p = config.audioOutputBufferProfile
    if (!p || !window.api?.setAudioOutputBufferProfile) return
    void window.api.setAudioOutputBufferProfile(p)
  }, [config.audioOutputBufferProfile])

  useEffect(() => {
    if (!window.api?.setAudioExclusive) return
    void window.api.setAudioExclusive(config.audioExclusive === true)
  }, [config.audioExclusive])

  useEffect(() => {
    if (!window.api?.setAudioGapless) return
    void window.api.setAudioGapless(!!config.gaplessEnabled)
    if (config.gaplessEnabled && config.crossfadeEnabled) {
      setConfig((prev) => ({ ...prev, crossfadeEnabled: false }))
    }
  }, [config.gaplessEnabled, config.crossfadeEnabled])

  useEffect(() => {
    if (!window.api?.setAudioDevice) return
    const savedDeviceId = config.audioDeviceId
    if (savedDeviceId == null || savedDeviceId === '') {
      void window.api.setAudioDevice('')
      return
    }
    if (!Array.isArray(audioDevices) || audioDevices.length === 0) return
    const matched = audioDevices.find((device) => String(device?.id) === String(savedDeviceId))
    if (!matched) return
    void window.api.setAudioDevice(matched.id)
  }, [config.audioDeviceId, audioDevices])

  // Persist playlist and mode
  useEffect(() => {
    schedulePersistedState(
      'playlist',
      'nc_playlist',
      playlist,
      config.autoSaveLibrary !== false && playlistStoreHydratedRef.current
    )
  }, [playlist, config.autoSaveLibrary, schedulePersistedState])

  useEffect(() => {
    localStorage.setItem('nc_queue_playback_enabled', queuePlaybackEnabled ? '1' : '0')
    if (
      config.autoSaveLibrary !== false &&
      queuePlaybackStoreHydratedRef.current &&
      window.api?.appStateSet
    ) {
      void window.api.appStateSet('queuePlaybackEnabled', !!queuePlaybackEnabled)
    }
  }, [queuePlaybackEnabled, config.autoSaveLibrary])

  useEffect(() => {
    localStorage.setItem('nc_playmode', playMode)
    if (
      config.autoSaveLibrary !== false &&
      playModeStoreHydratedRef.current &&
      window.api?.appStateSet
    ) {
      void window.api.appStateSet('playMode', playMode)
    }
  }, [playMode, config.autoSaveLibrary])

  useEffect(() => {
    localStorage.setItem(STORED_VOLUME_KEY, String(clampVolume(volume)))
    if (volumeStoreHydratedRef.current && window.api?.appStateSet) {
      void window.api.appStateSet('volume', clampVolume(volume))
    }
  }, [volume])

  useEffect(() => {
    if (volume > 0.001) remotePreviousVolumeRef.current = volume
  }, [volume])

  useEffect(() => {
    schedulePersistedState(
      'playbackHistory',
      'nc_playback_history',
      playbackHistory,
      playbackHistoryStoreHydratedRef.current
    )
  }, [playbackHistory, schedulePersistedState])

  useEffect(() => {
    schedulePersistedState(
      'userPlaylists',
      'nc_user_playlists',
      userPlaylists,
      config.autoSaveLibrary !== false && userPlaylistsStoreHydratedRef.current
    )
  }, [userPlaylists, config.autoSaveLibrary, schedulePersistedState])

  useEffect(() => {
    schedulePersistedState(
      'userSmartCollections',
      USER_SMART_COLLECTIONS_LOCAL_KEY,
      userSmartCollections,
      config.autoSaveLibrary !== false && userSmartCollectionsStoreHydratedRef.current
    )
  }, [userSmartCollections, config.autoSaveLibrary, schedulePersistedState])

  useEffect(() => {
    schedulePersistedState(
      'displayMetadataOverrides',
      DISPLAY_METADATA_OVERRIDES_LOCAL_KEY,
      displayMetadataOverrides,
      config.autoSaveLibrary !== false && displayMetadataOverridesHydratedRef.current
    )
  }, [displayMetadataOverrides, config.autoSaveLibrary, schedulePersistedState])

  // Persist imported folders
  useEffect(() => {
    schedulePersistedState(
      'importedFolders',
      'nc_imported_folders',
      importedFolders,
      importedFoldersHydratedRef.current
    )
  }, [importedFolders, schedulePersistedState])

  useEffect(() => {
    if (!libraryStateReady || !playbackSessionRestoreReady) return
    persistPlaybackSession(getPlaybackSessionSnapshot(), true)
  }, [
    currentIndex,
    playlist,
    activePlaybackContext,
    libraryStateReady,
    playbackSessionRestoreReady,
    getPlaybackSessionSnapshot,
    persistPlaybackSession
  ])

  useEffect(() => {
    if (!libraryStateReady || !playbackSessionRestoreReady || isSeeking || currentIndex < 0) return
    const now = Date.now()
    if (
      isPlaying &&
      now - playbackSessionLastProgressPersistRef.current <
        PLAYBACK_SESSION_PLAYING_PERSIST_INTERVAL_MS
    ) {
      return
    }
    playbackSessionLastProgressPersistRef.current = now
    persistPlaybackSession(getPlaybackSessionSnapshot(), true)
  }, [
    Math.floor(Math.max(0, currentTime)),
    isPlaying,
    isSeeking,
    currentIndex,
    libraryStateReady,
    playbackSessionRestoreReady,
    getPlaybackSessionSnapshot,
    persistPlaybackSession
  ])

  useEffect(() => {
    if (!libraryStateReady || !playbackSessionRestoreReady || isSeeking || currentIndex < 0) return
    persistPlaybackSession(getPlaybackSessionSnapshot(), true)
  }, [
    isSeeking,
    currentIndex,
    libraryStateReady,
    playbackSessionRestoreReady,
    getPlaybackSessionSnapshot,
    persistPlaybackSession
  ])

  useEffect(() => {
    if (!window.api?.onLibraryFoldersChanged) return undefined
    return window.api.onLibraryFoldersChanged((payload) => {
      applyLibraryFolderDelta(payload)
    })
  }, [applyLibraryFolderDelta])

  useEffect(() => {
    if (!libraryStateReady) return undefined
    if (!window.api?.watchLibraryFolders || !window.api?.stopWatchingLibraryFolders)
      return undefined
    if (!importedFolders.length) {
      void window.api.stopWatchingLibraryFolders().catch(() => {})
      return undefined
    }

    let disposed = false
    const existingTracks = playlistRef.current
      .filter((track) => isTrackInsideImportedFolders(track?.path, importedFolders))
      .map(buildImportedFolderTrackSeed)
      .filter(Boolean)

    window.api.watchLibraryFolders({ folders: importedFolders, existingTracks }).catch((error) => {
      if (!disposed) {
        console.error('Library watch start failed:', error)
      }
    })

    return () => {
      disposed = true
      void window.api.stopWatchingLibraryFolders().catch(() => {})
    }
  }, [libraryStateReady, importedFolders])

  // Auto-rescan imported folders on startup to discover new files
  useEffect(() => {
    if (!libraryStateReady || !importedFolders.length || !window.api?.rescanFolders) return
    if (startupImportedFolderRescanDoneRef.current) return
    startupImportedFolderRescanDoneRef.current = true
    let cancelled = false
    const foldersForStartupRescan = importedFolders.slice()
    const existingPathsForStartupRescan = playlistRef.current
      .filter((track) => isTrackInsideImportedFolders(track?.path, foldersForStartupRescan))
      .map((track) => track.path)
      .filter(Boolean)
    const doRescan = async () => {
      try {
        let scannedTracks = []
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const rescanResult = await window.api.rescanFolders({
            folders: foldersForStartupRescan,
            existingPaths: existingPathsForStartupRescan
          })
          if (cancelled || !Array.isArray(rescanResult)) return
          scannedTracks = rescanResult
          const hasImportedTracks = playlistRef.current.some((track) =>
            isTrackInsideImportedFolders(track?.path, foldersForStartupRescan)
          )
          if (scannedTracks.length || hasImportedTracks || attempt === 2) break
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
        }

        const previousImportedTracks = playlistRef.current.filter((track) =>
          isTrackInsideImportedFolders(track?.path, foldersForStartupRescan)
        )
        const delta = diffImportedFolderSnapshot(
          previousImportedTracks,
          scannedTracks.map(normalizeWatchedTrack).filter(Boolean)
        )

        const safeStartupDelta = {
          renamed: [],
          removedPaths: [],
          added: delta.added
        }

        if (safeStartupDelta.added.length) {
          applyLibraryFolderDelta(safeStartupDelta)
          if (window.api?.watchLibraryFolders) {
            const seededTracks = playlistRef.current
              .filter((track) => isTrackInsideImportedFolders(track?.path, foldersForStartupRescan))
              .map(buildImportedFolderTrackSeed)
              .filter(Boolean)
            void window.api.watchLibraryFolders({
              folders: foldersForStartupRescan,
              existingTracks: seededTracks
            })
          }
        }
      } catch (e) {
        console.error('Folder rescan failed:', e)
      }
    }
    const delayMs =
      existingPathsForStartupRescan.length > 0 ? STARTUP_IMPORTED_FOLDER_RESCAN_DELAY_MS : 0
    startupImportedFolderRescanTimerRef.current = window.setTimeout(() => {
      startupImportedFolderRescanTimerRef.current = null
      void doRescan()
    }, delayMs)
    return () => {
      cancelled = true
      if (startupImportedFolderRescanTimerRef.current) {
        window.clearTimeout(startupImportedFolderRescanTimerRef.current)
        startupImportedFolderRescanTimerRef.current = null
      }
    }
  }, [libraryStateReady, importedFolders, applyLibraryFolderDelta])

  // Update playback speed whenever it changes
  useEffect(() => {
    playbackRateRef.current = playbackRate
    if (useNativeEngineRef.current) {
      window.api?.setAudioPlaybackRate?.(playbackRate)
    } else if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // Update volume -HTML audio / gain node (no IPC)
  useEffect(() => {
    if (useNativeEngineRef.current) {
      // Native mode: HTML audio at full volume so Web Audio analyser gets data,
      // but mute the final gain node so no sound comes from the Web Audio pipeline.
      if (audioRef.current) audioRef.current.volume = 1
      if (gainNode.current) gainNode.current.gain.value = 0
    } else {
      if (audioRef.current) {
        audioRef.current.volume = volume
      }
      if (gainNode.current) gainNode.current.gain.value = 1
    }
  }, [volume, useNativeEngine])

  // Native engine volume via main process (rAF while dragging to reduce IPC flood)
  useEffect(() => {
    if (!useNativeEngineRef.current || !window.api?.setAudioVolume) return
    if (!isVolumeDragging) {
      window.api.setAudioVolume(volume)
      return
    }
    const id = requestAnimationFrame(() => {
      window.api.setAudioVolume(volume)
    })
    return () => cancelAnimationFrame(id)
  }, [volume, useNativeEngine, isVolumeDragging])

  // Keep main-process HiFi EQ in sync (PCM DSP on native bridge path)
  useEffect(() => {
    if (!window.api?.setAudioEqConfig) return
    void window.api.setAudioEqConfig({
      useEQ: config.useEQ,
      preamp: config.preamp ?? 0,
      eqBands: effectiveEqBands,
      eqOversampling: config.eqOversampling || '2x',
      eqOutputSafety: config.eqOutputSafety || 'soft'
    })
  }, [config.useEQ, config.preamp, effectiveEqBands, config.eqOversampling, config.eqOutputSafety])

  const handleTrackEndedAdvance = useCallback(() => {
    const libraryPaths = getLibraryPlaybackPaths()
    if (libraryPaths.length === 0) return

    if (queuePlaybackEnabled) {
      const queueSnapshot = upNextQueueRef.current
      if (queueSnapshot.length > 0) {
        let nextPath = null
        const remaining = []
        for (const item of queueSnapshot) {
          const path = item?.path
          if (typeof path !== 'string' || !path) continue
          const exists = playlistRef.current.some((track) => track.path === path)
          if (!exists) continue
          if (!nextPath) nextPath = path
          else remaining.push({ path })
        }
        if (nextPath) {
          const nextIdx = playlistRef.current.findIndex((track) => track.path === nextPath)
          setUpNextQueue(remaining)
          if (nextIdx !== -1) {
            currentTimeRef.current = 0
            mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
            setCurrentIndex(nextIdx)
            setCurrentTime(0)
            setIsPlaying(true)
            return
          }
        }
      }
    }

    if (playMode === 'single') {
      currentTimeRef.current = 0
      mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
      setCurrentTime(0)

      if (useNativeEngineRef.current && window.api?.playAudio) {
        const trackPath = playlistRef.current[currentIndexRef.current]?.path
        if (trackPath) {
          window.api.playAudio(trackPath, 0, playbackRateRef.current).catch(console.error)
          setIsPlaying(true)
          return
        }
      }

      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(console.error)
        setIsPlaying(true)
        return
      }
    }

    const nextPath = getPlaybackSequencePath(getPlaybackSequenceSnapshot(), {
      direction: 'next',
      playMode
    })
    const nextIdx = playlistRef.current.findIndex((track) => track.path === nextPath)
    if (nextIdx === -1) return
    currentTimeRef.current = 0
    mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
    setCurrentIndex(nextIdx)
    setCurrentTime(0)
    setIsPlaying(true)
  }, [queuePlaybackEnabled, playMode, getLibraryPlaybackPaths, getPlaybackSequenceSnapshot])

  // Audio setup
  useEffect(() => {
    const audio = audioRef.current
    audio.preservesPitch = false // THE MAGIC: disabling pitch preservation!

    const setAudioData = () => {
      const track = playlist[currentIndex]
      const path = track?.path || ''
      const dsdLocal = useNativeEngineRef.current && path && /\.(dsf|dff)$/i.test(path)
      // Browser cannot decode DSD; audio.duration is bogus -duration comes from main (ffprobe).
      if (!dsdLocal) {
        setDuration(audio.duration)
      }
      audio.playbackRate = playbackRateRef.current // Preserves NC speed naturally!
    }
    const updateTime = () => {
      if (useNativeEngineRef.current) return
      if (isSeekingRef.current) return
      const time = audio.currentTime
      syncCurrentTimeFromNativeStatus(time)

      if (lyricsTimingSurfaceActive && lyricsRef.current.length > 0) {
        const nextLyricIndex = getActiveLyricIndex(
          lyricsRef.current,
          time,
          configRef.current.lyricsOffsetMs
        )
        if (nextLyricIndex !== activeLyricIndexRef.current) {
          activeLyricIndexRef.current = nextLyricIndex
          setActiveLyricIndex(nextLyricIndex)
        }
      }
    }
    const onEnded = () => {
      if (useNativeEngineRef.current) return
      handleTrackEndedAdvance()
    }

    audio.addEventListener('loadeddata', setAudioData)
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadeddata', setAudioData)
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('ended', onEnded)
    }
  }, [
    handleTrackEndedAdvance,
    lyricsTimingSurfaceActive,
    playlist,
    currentIndex,
    syncCurrentTimeFromNativeStatus
  ])
  const applyStartTimeToAudio = useCallback((audio, nextTime) => {
    if (!audio || !(nextTime > 0)) return
    const apply = () => {
      try {
        if (Math.abs((audio.currentTime || 0) - nextTime) > 0.25) {
          audio.currentTime = nextTime
        }
      } catch {
        /* ignore */
      }
    }
    if (audio.readyState >= 1) {
      apply()
      return
    }
    const once = () => {
      audio.removeEventListener('loadedmetadata', once)
      audio.removeEventListener('loadeddata', once)
      apply()
    }
    audio.addEventListener('loadedmetadata', once)
    audio.addEventListener('loadeddata', once)
  }, [])

  const clearNativeHtmlAudioMirror = useCallback(() => {
    if (!useNativeEngineRef.current) return
    const audio = audioRef.current
    if (!audio) return
    try {
      audio.pause()
      if (audio.src) {
        audio.removeAttribute('src')
        audio.src = ''
        audio.load()
      }
    } catch {
      /* best effort: the native engine owns audible playback. */
    }
  }, [])

  const prepareNativeHtmlAudioMirror = useCallback(
    (trackPath, startTime = 0) => {
      if (
        !useNativeEngineRef.current ||
        !nativeHtmlAudioMirrorNeededRef.current ||
        !trackPath ||
        isRemoteTrackPath(trackPath)
      ) {
        clearNativeHtmlAudioMirror()
        return false
      }

      const audio = audioRef.current
      const nextSrc = localPathToAudioSrc(trackPath)
      if (!audio || !nextSrc) return false
      try {
        if (audio.src !== nextSrc) {
          audio.src = nextSrc
          audio.load()
        }
        applyStartTimeToAudio(audio, startTime)
        return true
      } catch {
        return false
      }
    },
    [applyStartTimeToAudio, clearNativeHtmlAudioMirror]
  )

  // Play track logic
  useEffect(() => {
    if (currentIndex >= 0 && playlist[currentIndex]) {
      const track = playlist[currentIndex]
      const pendingSession = pendingTrackStartRef.current
      const restoreStartTime =
        pendingSession?.trackPath === track.path
          ? Math.max(0, Number(pendingSession.currentTimeSec) || 0)
          : lastLoadedTrackPathRef.current === track.path
            ? Math.max(0, Number(currentTimeRef.current) || 0)
            : 0
      const isTrackPathChange = lastLoadedTrackPathRef.current !== track.path
      if (isTrackPathChange || pendingSession?.trackPath === track.path) {
        currentTimeRef.current = restoreStartTime
        setCurrentTime(restoreStartTime)
      }

      const trackIsRemote = isRemoteTrackPath(track.path)
      if (useNativeEngineRef.current && window.api?.playAudio) {
        const suppressNativeStart = nativeSilentTrackSwitchRef.current === track.path
        if (suppressNativeStart) nativeSilentTrackSwitchRef.current = ''
        const now = Date.now()
        const d = nativePlayDedupeRef.current
        if (d.path === track.path && d.index === currentIndex && now - d.t < 120) {
          loadTrackData(track.path, {
            title: track.info?.title || track.title || stripExtension(track.name || ''),
            artist: track.info?.artist || track.artist || '',
            album: track.info?.album || '',
            embeddedLyrics: track.info?.lyrics || track.lyrics || '',
            mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
            sourceUrl: track.sourceUrl || track.mvOriginUrl,
            hasLyrics: track.hasLyrics === true
          })
          return
        }
        d.path = track.path
        d.index = currentIndex
        d.t = now
        const htmlMirrorReady = prepareNativeHtmlAudioMirror(track.path, restoreStartTime)
        // Important: do NOT start native playback when UI is paused.
        // Otherwise a state refresh (e.g. after window resize/background) can restart from 0
        // while the play button still shows "paused".
        if (isPlaying) {
          if (htmlMirrorReady) {
            audioRef.current.play().catch(() => {})
          }
          nativePlayJustCalledRef.current = true
          if (suppressNativeStart) {
            console.log('[App] Automix UI switched without restarting native audio')
          } else {
            window.api
              .playAudio(track.path, restoreStartTime, playbackRateRef.current)
              .catch((e) => {
                console.error('[App] Native playAudio failed:', e)
                const activePath = playlistRef.current[currentIndexRef.current]?.path
                if (activePath === track.path) {
                  window.api?.stopAudio?.()
                  setIsPlaying(false)
                  setCurrentTime(0)
                  currentTimeRef.current = 0
                }
              })
          }
        } else {
          nativePlayJustCalledRef.current = false
          audioRef.current.pause()
          // Ensure native engine is not accidentally left playing.
          window.api.pauseAudio?.()
        }
      } else {
        // Legacy path: play through HTML <audio> element
        if (trackIsRemote) {
          window.api?.remoteLibrary?.resolveStreamUrl?.(track.path).then((result) => {
            const activePath = playlistRef.current[currentIndexRef.current]?.path
            if (!result?.ok || !result.url || activePath !== track.path) return
            audioRef.current.src = result.url
            audioRef.current.load()
            applyStartTimeToAudio(audioRef.current, restoreStartTime)
            if (isPlaying) {
              audioRef.current.play().catch(console.error)
            }
          })
        } else {
          audioRef.current.src = localPathToAudioSrc(track.path)
          audioRef.current.load()
          applyStartTimeToAudio(audioRef.current, restoreStartTime)
          if (isPlaying) {
            audioRef.current.play().catch(console.error)
          }
        }
      }

      if (pendingSession?.trackPath === track.path) {
        pendingTrackStartRef.current = null
        setCurrentTime(restoreStartTime)
      }
      lastLoadedTrackPathRef.current = track.path

      // Load cover art, metadata, and lyrics only when the active track changes.
      // A play/pause toggle also reruns this effect; reloading here would briefly clear lyrics.
      if (isTrackPathChange || pendingSession?.trackPath === track.path) {
        loadTrackData(track.path, {
          title: track.info?.title || track.title || stripExtension(track.name || ''),
          artist: track.info?.artist || track.artist || '',
          album: track.info?.album || '',
          embeddedLyrics: track.info?.lyrics || track.lyrics || '',
          mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
          sourceUrl: track.sourceUrl || track.mvOriginUrl,
          hasLyrics: track.hasLyrics === true
        })
      }
    } else {
      lastLastFmTrackKeyRef.current = ''
      lastLastFmNowPlayingKeyRef.current = ''
      lastLastFmScrobbleKeyRef.current = ''
      lastFmScrobbleInFlightRef.current = false
    }
  }, [applyStartTimeToAudio, currentIndex, isPlaying, playlist, prepareNativeHtmlAudioMirror])

  useEffect(() => {
    if (window.api?.getAudioDevices) {
      window.api.getAudioDevices().then(setAudioDevices)
    }
  }, [])

  // Detect if native HiFi engine is available via first status update
  useEffect(() => {
    if (!window.api?.onAudioStatus) return
    let detected = false
    return window.api.onAudioStatus((status) => {
      if (detected) return
      if (status && typeof status.nativeBridge === 'boolean') {
        detected = true
        setUseNativeEngine(status.nativeBridge)
        useNativeEngineRef.current = status.nativeBridge
        if (status.nativeBridge) {
          console.log('[App] HiFi native engine detected, switching playback path')
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!window.api?.cast?.onPauseLocal) return
    return window.api.cast.onPauseLocal(() => {
      setIsPlaying(false)
      if (audioRef.current) audioRef.current.pause()
    })
  }, [])

  useEffect(() => {
    if (window.api?.cast?.getStatus) {
      window.api.cast.getStatus().then((s) => {
        setLastCastStatus(s)
        setCastDlnaListening(!!(s.dlnaEnabled || s.airplayEnabled))
        setCastRemoteActive(isCastSessionActive(s))
      })
    }
  }, [])

  useEffect(() => {
    if (!window.api?.cast?.onStatus) return
    return window.api.cast.onStatus((s) => {
      setLastCastStatus(s)
      setCastDlnaListening(!!(s.dlnaEnabled || s.airplayEnabled))
      setCastRemoteActive(isCastSessionActive(s))
    })
  }, [])

  useEffect(() => {
    if (!castRemoteActive || !window.api?.setAudioVolume) return
    window.api.setAudioVolume(volume)
  }, [volume, castRemoteActive])

  // Hi-Fi Native Audio Status Listener
  useEffect(() => {
    if (!window.api?.onAudioStatus) return
    let lastExclusive = false
    return window.api.onAudioStatus((status) => {
      if (!status) return
      latestNativeAudioStatusRef.current = status
      if (status.exclusive !== lastExclusive) {
        lastExclusive = !!status.exclusive
        setIsAudioExclusive(!!status.exclusive)
        setConfig((prev) =>
          prev.audioExclusive === !!status.exclusive
            ? prev
            : { ...prev, audioExclusive: !!status.exclusive }
        )
      }
      if (!status.nativeBridge) return
      if (isSeekingRef.current) return

      const activeTrack = playlistRef.current[currentIndexRef.current]
      const statusPath = String(status.filePath || '')
      const activePath = String(activeTrack?.path || '')
      const statusMatchesActiveTrack = nativeStatusPathMatchesActiveTrack(statusPath, activePath)
      if (statusMatchesActiveTrack) {
        maybeArmNativeAutomixFromClock(status.currentTime)
        syncCurrentTimeFromNativeStatus(status.currentTime)

        // Keep HTML audio element in sync with native engine position
        // so waveform analyser, MV sync, and lyrics all read correct time
        const audio = audioRef.current
        if (audio && Math.abs((audio.currentTime || 0) - status.currentTime) > 0.5) {
          try {
            audio.currentTime = status.currentTime
          } catch {
            /* ignore */
          }
        }

        if (lyricsTimingSurfaceActive && lyricsRef.current.length > 0) {
          const nextLyricIndex = getActiveLyricIndex(
            lyricsRef.current,
            status.currentTime,
            configRef.current.lyricsOffsetMs
          )
          if (nextLyricIndex !== activeLyricIndexRef.current) {
            activeLyricIndexRef.current = nextLyricIndex
            setActiveLyricIndex(nextLyricIndex)
          }
        }
      }
    })
  }, [lyricsTimingSurfaceActive, maybeArmNativeAutomixFromClock, syncCurrentTimeFromNativeStatus])

  useEffect(() => {
    if (useNativeEngineRef.current && window.api) {
      if (isPlaying) {
        const activeTrack = playlistRef.current[currentIndexRef.current]
        const htmlMirrorReady = prepareNativeHtmlAudioMirror(
          activeTrack?.path || '',
          currentTimeRef.current
        )
        if (htmlMirrorReady) {
          initAudioContext()
          if (audioContext.current?.state === 'suspended') {
            audioContext.current.resume()
          }
          // Native playback owns the audible path. The HTML mirror is only for the EQ RTA.
          audioRef.current.play().catch(() => {})
        } else {
          clearNativeHtmlAudioMirror()
        }
        if (nativePlayJustCalledRef.current) {
          nativePlayJustCalledRef.current = false
        } else {
          window.api.resumeAudio?.()
        }
      } else {
        nativePlayJustCalledRef.current = false
        audioRef.current.pause()
        window.api.pauseAudio?.()
      }
    } else {
      if (isPlaying) {
        initAudioContext()
        if (audioContext.current?.state === 'suspended') {
          audioContext.current.resume()
        }
        audioRef.current.play().catch(console.error)
      } else {
        audioRef.current.pause()
      }
    }
  }, [
    clearNativeHtmlAudioMirror,
    isPlaying,
    initAudioContext,
    nativeHtmlAudioMirrorNeeded,
    prepareNativeHtmlAudioMirror
  ])

  const lyricsRef = useRef([])
  const lyricsRequestSeqRef = useRef(0)
  const localLyricsBeforeCastRef = useRef(null)
  const lastCastLyricsPathRef = useRef('')
  const scrollAreaRef = useRef(null)
  const lyricsInstantScrollUntilRef = useRef(0)
  const activeLyricIndexRef = useRef(activeLyricIndex)
  const sidebarPlaylistRef = useRef(null)
  const sidebarScrollbarDragRef = useRef(null)
  const albumGridRef = useRef(null)
  const albumOverviewScrollTopRef = useRef(0)
  const pendingAlbumOverviewRestoreRef = useRef(false)
  const pendingAlbumDetailScrollResetRef = useRef(false)
  const previousSongSortModeRef = useRef(songSortMode)
  const previousAlbumSortModeRef = useRef(albumSortMode)
  const previousFolderSortModeRef = useRef(folderSortMode)
  const previousTrackPathRef = useRef('')

  useEffect(() => {
    lyricsRef.current = lyrics
    setActiveLyricIndex(
      getActiveLyricIndex(lyrics, currentTimeRef.current, configRef.current.lyricsOffsetMs)
    )
  }, [lyrics])

  useEffect(() => {
    activeLyricIndexRef.current = activeLyricIndex
  }, [activeLyricIndex])

  useEffect(() => {
    lyricsMatchStatusRef.current = lyricsMatchStatus
    if (lyricsMatchStatus !== 'matched' && lyricsMatchStatus !== 'loading') {
      lyricsLoadedTrackPathRef.current = ''
    }
  }, [lyricsMatchStatus])

  const markLyricsSeekJump = useCallback((positionSec) => {
    const nextTime = Math.max(0, Number(positionSec) || 0)
    currentTimeRef.current = nextTime
    lyricsInstantScrollUntilRef.current = Date.now() + 650
    setLyricsRenderTime(nextTime)
    setActiveLyricIndex(
      getActiveLyricIndex(lyricsRef.current, nextTime, configRef.current.lyricsOffsetMs)
    )
  }, [])

  useEffect(() => {
    setTemporarilyHiddenLyricsTrackPath('')
    setTemporarilyHiddenMvTrackPath('')
    setLyricsQuickBarDismissed(false)
    setLyricsQuickBarActivityAt(Date.now())
  }, [currentTrackPath])

  useEffect(() => {
    if (!showLyrics || view !== 'player') return
    if (!currentTrackPath) return
    if (
      isCurrentTrackLyricsTemporarilyHidden ||
      isCurrentTrackMvTemporarilyHidden ||
      lyricsQuickBarDismissed
    )
      return
    const remainingMs = Math.max(0, 5000 - (Date.now() - lyricsQuickBarActivityAt))
    const timer = window.setTimeout(() => {
      setLyricsQuickBarDismissed(true)
    }, remainingMs)
    return () => clearTimeout(timer)
  }, [
    currentTrackPath,
    isCurrentTrackLyricsTemporarilyHidden,
    isCurrentTrackMvTemporarilyHidden,
    lyricsQuickBarActivityAt,
    lyricsQuickBarDismissed,
    showLyrics,
    view
  ])

  useEffect(() => {
    if (!showLyrics || config.lyricsHidden || !scrollAreaRef.current) return

    const scrollArea = scrollAreaRef.current
    const shouldSnap = Date.now() < lyricsInstantScrollUntilRef.current

    if (activeLyricIndex === -1) {
      if (shouldSnap) {
        scrollArea.scrollTo({ top: 0, behavior: 'auto' })
      }
      return
    }

    const activeElement = scrollArea.querySelector('.lyric-line.active')
    if (!activeElement) return

    const areaRect = scrollArea.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()
    const targetTop =
      scrollArea.scrollTop +
      (activeRect.top - areaRect.top) -
      scrollArea.clientHeight / 2 +
      activeRect.height / 2
    scrollArea.scrollTo({
      top: Math.max(0, targetTop),
      behavior: shouldSnap ? 'auto' : 'smooth'
    })
  }, [activeLyricIndex, showLyrics, config.lyricsHidden])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || lyricsRef.current.length === 0) return
    const time = useNativeEngineRef.current ? currentTimeRef.current : audio.currentTime
    setActiveLyricIndex(getActiveLyricIndex(lyricsRef.current, time, config.lyricsOffsetMs))
  }, [config.lyricsOffsetMs])

  useEffect(() => {
    const shouldPrepareRomaji =
      config.lyricsShowRomaji &&
      !isCurrentTrackLyricsInstrumental &&
      ((showLyrics &&
        view === 'player' &&
        !config.lyricsHidden &&
        !isCurrentTrackLyricsTemporarilyHidden) ||
        (config.desktopLyricsEnabled && config.desktopLyricsShowRomaji))

    if (!shouldPrepareRomaji) {
      setRomajiDisplayLines([])
      return
    }
    let cancelled = false
    ;(async () => {
      if (!lyrics.length) {
        setRomajiDisplayLines([])
        return
      }

      const plan = buildRomajiConversionPlan(lyrics, {
        cache: romajiConversionCacheRef.current,
        focusIndex: activeLyricIndexRef.current,
        noneLabel: i18n.t('lyrics.none')
      })
      setRomajiDisplayLines(plan.merged)

      if (plan.pending.length > 0 && window.api?.toRomajiBatch) {
        const merged = [...plan.merged]
        const chunkSize = 8
        try {
          for (let start = 0; start < plan.pending.length && !cancelled; start += chunkSize) {
            const chunk = plan.pending.slice(start, start + chunkSize)
            const converted = await window.api.toRomajiBatch(chunk.map((item) => item.text))
            chunk.forEach((item, j) => {
              const value = ((converted && converted[j]) || '').trim()
              merged[item.index] = value
              rememberRomajiCacheValue(romajiConversionCacheRef.current, item.text, value)
            })
            if (!cancelled) setRomajiDisplayLines([...merged])
            await new Promise((resolve) => window.setTimeout(resolve, 0))
          }
        } catch (e) {
          console.error('toRomajiBatch', e)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    lyrics,
    config.lyricsShowRomaji,
    config.lyricsHidden,
    config.desktopLyricsEnabled,
    config.desktopLyricsShowRomaji,
    config.uiLocale,
    isCurrentTrackLyricsInstrumental,
    isCurrentTrackLyricsTemporarilyHidden,
    showLyrics,
    view
  ])

  const cleanTitleForSearch = (rawTitle = '') => {
    if (!rawTitle) return ''
    let s = String(rawTitle)
    s = s.replace(/\[[^\]]*\]/g, ' ')
    s = s.replace(/\([^)]*\)/g, ' ')
    s = s.replace(/\b(cover|remix|live|ver\.?|version|feat\.?|ft\.?)\b/gi, '')
    s = s.replace(/[~`"'.,!?;:|/\\]+/g, ' ')
    s = s.replace(/\s+/g, ' ').trim()
    return s
  }

  const extractBookTitleQuotes = (rawTitle = '') => {
    const out = []
    const re = /[<\[]([^>\]]+)[>\]]/g
    let m
    while ((m = re.exec(rawTitle)) !== null) {
      const inner = (m[1] || '').trim()
      if (inner && inner.length <= 120) out.push(inner)
    }
    return out
  }

  const extractCornerQuotes = (rawTitle = '') => {
    const out = []
    const re = /["']([^"']+)["']/g
    let m
    while ((m = re.exec(rawTitle)) !== null) {
      const inner = (m[1] || '').trim()
      if (inner && inner.length <= 120) out.push(inner)
    }
    return out
  }

  const cleanArtistForLyrics = (raw = '') => {
    let s = (raw || '').trim()
    if (!s) return ''
    s = s.replace(/\s*\/\s*cover\s*/gi, ' ')
    s = s.replace(/\/\s*cover/gi, '')
    s = s.replace(/cover\s*\//gi, '')
    s = s.replace(/cover/gi, '')
    s = s.replace(/\//g, ' ')
    s = s.replace(/\s+/g, ' ').trim()
    return s
  }

  const buildLyricTitleVariants = (rawTitle = '') => {
    const seen = new Set()
    const list = []
    const add = (candidate) => {
      const cleaned = (cleanTitleForSearch(candidate) || candidate || '').trim()
      if (!cleaned || seen.has(cleaned)) return
      seen.add(cleaned)
      list.push(cleaned)
    }
    const rt = (rawTitle || '').trim()
    if (!rt) return list
    for (const q of extractBookTitleQuotes(rt)) add(q)
    for (const q of extractCornerQuotes(rt)) add(q)
    add(rt)

    const VERSION_MARKER_RE = /\b(remix|rmx|live|acoustic|instrumental|inst|cover|edit)\b/i
    if (VERSION_MARKER_RE.test(rt)) {
      let withVersion = rt
      withVersion = withVersion.replace(/\[[^\]]*\]/g, ' ')
      withVersion = withVersion.replace(/[~`"'.,!?;:|/\\]+/g, ' ')
      withVersion = withVersion.replace(/\bfeat\.?\b|\bft\.?\b/gi, '')
      withVersion = withVersion.replace(/\s+/g, ' ').trim().toLowerCase()
      if (withVersion && !seen.has(withVersion)) {
        seen.add(withVersion)
        list.push(withVersion)
      }
    }

    return list
  }

  const extractParenArtistHints = (rawTitle = '') => {
    if (!rawTitle) return []
    const seen = new Set()
    const out = []
    const re = /\(([^)]+)\)/g
    let m
    while ((m = re.exec(rawTitle)) !== null) {
      const inner = (m[1] || '').trim()
      if (!inner || inner.length > 80) continue
      if (/TV|size|instrumental|inst\.?|karaoke|off\s*vocal|ver\.|cover|MV|mv/i.test(inner)) {
        continue
      }
      const key = inner.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(inner)
    }
    return out
  }
  const readRuntimeCache = useCallback((ref, key, ttlMs) => {
    const hit = ref.current.get(key)
    if (!hit) return null
    if (Date.now() - hit.at > ttlMs) {
      ref.current.delete(key)
      return null
    }
    ref.current.delete(key)
    ref.current.set(key, hit)
    return hit.value
  }, [])

  const writeRuntimeCache = useCallback((ref, key, value, maxEntries = 32) => {
    ref.current.set(key, { value, at: Date.now() })
    trimMapCache(ref, maxEntries)
    return value
  }, [])

  const trimRuntimeCaches = useCallback(() => {
    trimMapCache(mvSearchCacheRef, MAX_MV_SEARCH_CACHE_ENTRIES)
    trimMapCache(biliStreamCacheRef, MAX_BILI_STREAM_CACHE_ENTRIES)
    trimMapCache(lrcLibCache, MAX_LRCLIB_CACHE_ENTRIES)
  }, [])

  const disposeTrackRuntimeState = useCallback(
    (previousTrackPath = '') => {
      cloudCoverFetchSeqRef.current += 1
      mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
      lastMvDirectSeekRef.current = { key: '', at: 0, target: -1 }
      lastMvIframeSeekRef.current = { key: '', at: 0, target: -1 }
      setShareCardSnapshot(null)
      setDynamicCoverTheme(null)
      setLyricsCandidateItems([])
      setLyricsCandidateLoading(false)
      setAutoMvSearchResults(null)
      setBiliDirectStream(null)
      trimRuntimeCaches()
      if (configRef.current?.devModeEnabled && previousTrackPath) {
        const coverEntries = Object.values(trackMetaMapRef.current || {}).filter(
          (entry) => !!entry?.cover
        ).length
        console.info('[memory]', {
          trackSwitches: trackSwitchCountRef.current,
          previousTrackPath,
          mvSearchCache: mvSearchCacheRef.current.size,
          biliStreamCache: biliStreamCacheRef.current.size,
          lrcLibCache: lrcLibCache.current.size,
          trackMetaCoverEntries: coverEntries
        })
      }
    },
    [currentTrackPath, trimRuntimeCaches]
  )

  useEffect(() => {
    const previousTrackPath = previousTrackPathRef.current
    if (previousTrackPath && previousTrackPath !== currentTrackPath) {
      trackSwitchCountRef.current += 1
      disposeTrackRuntimeState(previousTrackPath)
    }
    previousTrackPathRef.current = currentTrackPath
  }, [currentTrackPath, disposeTrackRuntimeState])

  useEffect(() => {
    if (!config.devModeEnabled) return undefined
    const dumpMemoryStats = () => {
      const stats = {
        trackSwitches: trackSwitchCountRef.current,
        mvSearchCache: mvSearchCacheRef.current.size,
        biliStreamCache: biliStreamCacheRef.current.size,
        lrcLibCache: lrcLibCache.current.size,
        trackMetaEntries: Object.keys(trackMetaMapRef.current || {}).length,
        trackMetaCoverEntries: Object.values(trackMetaMapRef.current || {}).filter(
          (entry) => !!entry?.cover
        ).length,
        currentTrackPath: playlistRef.current[currentIndexRef.current]?.path || ''
      }
      console.info('[memory:dump]', stats)
      return stats
    }

    window.__echoDumpMemoryStats = dumpMemoryStats
    return () => {
      delete window.__echoDumpMemoryStats
    }
  }, [config.devModeEnabled])

  const searchMvWithCache = useCallback(
    async (query, source = 'bilibili', options = {}) => {
      if (!window.api?.searchMVHandler) return null
      const normalizedQuery = String(query || '').trim()
      const normalizedSource =
        String(source || 'bilibili')
          .trim()
          .toLowerCase() || 'bilibili'
      if (!normalizedQuery) return null
      const contextTitle = String(options?.title || '').trim()
      const contextArtist = String(options?.artist || '').trim()
      const contextCacheKey =
        contextTitle || contextArtist
          ? `::${contextTitle.toLowerCase()}::${contextArtist.toLowerCase()}`
          : ''
      const cacheKey = `${normalizedSource}::${normalizedQuery.toLowerCase()}${contextCacheKey}`
      const cached = readRuntimeCache(mvSearchCacheRef, cacheKey, MV_SEARCH_CACHE_TTL_MS)
      if (cached !== null) return cached
      const pending = mvSearchPendingRef.current.get(cacheKey)
      if (pending) return pending
      const payloadOptions =
        contextTitle || contextArtist ? { title: contextTitle, artist: contextArtist } : undefined
      const task = window.api
        .searchMVHandler(normalizedQuery, normalizedSource, payloadOptions)
        .then((result) =>
          writeRuntimeCache(mvSearchCacheRef, cacheKey, result || null, MAX_MV_SEARCH_CACHE_ENTRIES)
        )
        .finally(() => {
          mvSearchPendingRef.current.delete(cacheKey)
        })
      mvSearchPendingRef.current.set(cacheKey, task)
      return task
    },
    [readRuntimeCache, writeRuntimeCache]
  )

  const resolveBiliDirectStreamCached = useCallback(
    async (bvid, qn) => {
      if (!window.api?.resolveBilibiliStream) return null
      const normalizedBvid = String(bvid || '').trim()
      if (!normalizedBvid) return null
      const cacheKey = `${normalizedBvid}::${qn}`
      const cached = readRuntimeCache(biliStreamCacheRef, cacheKey, BILI_STREAM_CACHE_TTL_MS)
      if (cached) return cached
      const pending = biliStreamPendingRef.current.get(cacheKey)
      if (pending) return pending
      const task = window.api
        .resolveBilibiliStream(normalizedBvid, qn)
        .then((result) =>
          result?.ok
            ? writeRuntimeCache(biliStreamCacheRef, cacheKey, result, MAX_BILI_STREAM_CACHE_ENTRIES)
            : result
        )
        .finally(() => {
          biliStreamPendingRef.current.delete(cacheKey)
        })
      biliStreamPendingRef.current.set(cacheKey, task)
      return task
    },
    [readRuntimeCache, writeRuntimeCache]
  )

  const searchBilibiliMv = useCallback(
    async (title = '', artist = '') => {
      if (!window.api?.searchMVHandler) return null

      const safeTitle = cleanTitleForSearch(title || '')
      const safeArtist = (artist || '').trim()
      const queries = buildBilibiliAutoMvQueries(safeTitle, safeArtist)
      let fallbackHit = null

      for (const q of queries) {
        try {
          const result = await searchMvWithCache(q.trim(), 'bilibili', {
            title: safeTitle,
            artist: safeArtist
          })
          const hit = getAutoMvSearchHit(result, 'bilibili')
          if (hit?.id) return hit
          const bestEffortHit = getBestEffortMvSearchHit(result, 'bilibili')
          if (bestEffortHit?.id && (!fallbackHit || bestEffortHit.score > fallbackHit.score)) {
            fallbackHit = bestEffortHit
          }
        } catch (_) {
          // try next query
        }
      }

      return fallbackHit || null
    },
    [searchMvWithCache]
  )

  const searchAndApplyMvForTrack = useCallback(
    async ({
      filePath,
      title = '',
      artist = '',
      hints = {},
      requestSeq = null,
      force = false
    }) => {
      if (
        !filePath ||
        !window.api?.searchMVHandler ||
        (!force && !mvLoadSurfaceActiveRef.current)
      ) {
        return
      }

      const isStaleRequest = () =>
        requestSeq !== null && requestSeq !== undefined && requestSeq !== trackLoadSeqRef.current

      setIsSearchingMV(true)
      try {
        let foundId = null
        let mvSource = configRef.current.mvSource || 'bilibili'
        let foundMvTitle = ''
        let foundMvAuthor = ''
        let mvSelectionOrigin = 'auto'
        const isPackagedFileProtocol =
          typeof window !== 'undefined' && window.location?.protocol === 'file:'

        const applyPersistedMv = (persistedMv) => {
          foundId = persistedMv.id
          mvSource = persistedMv.source
          foundMvTitle = persistedMv.title || ''
          foundMvAuthor = persistedMv.author || ''
          mvSelectionOrigin = persistedMv.origin || 'manual'
        }

        const persistedMv = getMvOverrideForPath(filePath)
        if (
          persistedMv?.id &&
          persistedMv?.source &&
          persistedMv.origin !== 'auto' &&
          persistedMv.origin !== 'source'
        ) {
          applyPersistedMv(persistedMv)
        }

        let mvFromDownloadedSource = false
        if (!foundId && !isRemoteTrackPath(filePath) && window.api?.readInfoJsonHandler) {
          const infoJson = await window.api.readInfoJsonHandler(filePath).catch(() => null)
          if (isStaleRequest()) return
          const sourceMv = resolveDownloadedSourceMv(infoJson)
          if (sourceMv) {
            foundId = sourceMv.id
            mvSource = sourceMv.source
            mvSelectionOrigin = 'source'
            mvFromDownloadedSource = true
          }
        }

        if (!foundId) {
          const sourceMv = resolveDownloadedSourceMv({
            mvOriginUrl: hints?.mvOriginUrl,
            sourceUrl: hints?.sourceUrl
          })
          if (sourceMv) {
            foundId = sourceMv.id
            mvSource = sourceMv.source
            mvSelectionOrigin = 'source'
            mvFromDownloadedSource = true
          }
        }

        if (!foundId) {
          if (persistedMv?.id && persistedMv?.source && persistedMv.origin === 'source') {
            applyPersistedMv(persistedMv)
          }
        }

        if (
          !foundId &&
          title &&
          (configRef.current.autoSearchMV || configRef.current.preloadMV || force)
        ) {
          const cleanedTitle = cleanTitleForSearch(title)
          const mvSearchContext = { title: cleanedTitle, artist: artist || '' }
          const mvSearchContextKey = `${cleanedTitle.toLowerCase()}::${String(
            artist || ''
          ).toLowerCase()}`
          const mvQueries =
            mvSource === 'bilibili'
              ? buildBilibiliAutoMvQueries(cleanedTitle, artist || '')
              : buildYoutubeAutoMvQueries(cleanedTitle, artist || '')
          let foundCandidates = false
          for (const mvQuery of mvQueries) {
            const searchCacheKey = `${filePath}::${mvSource}::${mvQuery.toLowerCase()}::${mvSearchContextKey}`
            let searchResult = autoMvSearchByTrackRef.current.get(searchCacheKey)
            if (searchResult === undefined) {
              searchResult = await searchMvWithCache(mvQuery, mvSource, mvSearchContext)
              autoMvSearchByTrackRef.current.set(searchCacheKey, searchResult || null)
            }
            if (isStaleRequest()) return
            if (searchResult) {
              const items = orderMvSearchItems(searchResult, mvSource)
              if (items.length > 0) {
                foundCandidates = true
                setAutoMvSearchResults({
                  status: 'ready',
                  filePath,
                  title: cleanedTitle,
                  artist: artist || '',
                  source: mvSource,
                  query: mvQuery,
                  items,
                  updatedAt: Date.now()
                })
                console.log(`[MV] ${mvSource} candidates for "${mvQuery}": items=${items.length}`)
                const hit =
                  getAutoMvSearchHit(searchResult, mvSource) ||
                  getBestEffortMvSearchHit(searchResult, mvSource)
                const resultMeta =
                  hit?.result && typeof hit.result === 'object' ? hit.result : items[0] || {}
                if (hit?.id || items[0]?.id) {
                  foundId = hit?.id || items[0].id
                  mvSource = hit?.source || items[0].source || mvSource
                  foundMvTitle = resultMeta.title || ''
                  foundMvAuthor = resultMeta.author || ''
                  mvSelectionOrigin = 'auto'
                }
                break
              }
            }
          }
          if (!foundCandidates && !isStaleRequest()) {
            setAutoMvSearchResults({
              status: 'empty',
              filePath,
              title: cleanedTitle,
              artist: artist || '',
              source: mvSource,
              query: mvQueries[0] || cleanedTitle,
              items: [],
              updatedAt: Date.now()
            })
          }
        }

        if (
          foundId &&
          mvSource === 'youtube' &&
          mvSelectionOrigin !== 'manual' &&
          !mvFromDownloadedSource &&
          isPackagedFileProtocol &&
          configRef.current.autoFallbackToBilibili
        ) {
          const bilibiliHit = await searchBilibiliMv(title || '', artist || '')
          if (isStaleRequest()) return
          if (bilibiliHit?.id) {
            const resultMeta =
              bilibiliHit.result && typeof bilibiliHit.result === 'object' ? bilibiliHit.result : {}
            foundId = bilibiliHit.id
            mvSource = bilibiliHit.source || 'bilibili'
            mvSelectionOrigin = 'auto'
            foundMvTitle = resultMeta.title || foundMvTitle
            foundMvAuthor = resultMeta.author || foundMvAuthor
            console.warn('[MV Fallback] Pre-fallback in packaged mode: YouTube -> Bilibili')
          }
        }

        if (foundId) {
          if (isStaleRequest()) return
          setMvId((prev) => {
            const nextMv = {
              id: foundId,
              source: mvSource,
              title: foundMvTitle || prev?.title || '',
              author: foundMvAuthor || prev?.author || ''
            }
            return prev?.id === foundId &&
              prev?.source === mvSource &&
              (prev?.title || '') === nextMv.title &&
              (prev?.author || '') === nextMv.author
              ? prev
              : nextMv
          })
          setMvOverrideForPath(filePath, {
            id: foundId,
            source: mvSource,
            title: foundMvTitle,
            author: foundMvAuthor,
            origin: mvSelectionOrigin
          })
        } else if (!isStaleRequest()) {
          setMvId(null)
          setBiliDirectStream(null)
          setMvPlaybackQuality(null)
        }
      } catch (e) {
        console.error('MV search error', e)
      } finally {
        setIsSearchingMV(false)
      }
    },
    [searchBilibiliMv, searchMvWithCache]
  )

  const preloadMvForTrack = useCallback(
    async (track, activePath = '') => {
      if (!track?.path || !configRef.current.preloadMV || !window.api?.searchMVHandler) return false
      if (activePath && track.path === activePath) return false

      const storedMeta = trackMetaMapRef.current?.[track.path] || {}
      const parsedInfo = parseTrackInfo(track, storedMeta)
      const rawTitle =
        parsedInfo?.title || storedMeta.title || track.info?.title || stripExtension(track.name || '')
      const title = cleanTitleForSearch(rawTitle)
      if (!title) return false

      const parsedArtist =
        parsedInfo?.artist && parsedInfo.artist !== 'Unknown Artist' ? parsedInfo.artist : ''
      const artist = parsedArtist || storedMeta.artist || track.info?.artist || ''
      let mvSource = configRef.current.mvSource || 'bilibili'
      let selectedMv = null

      const persistedMv = getMvOverrideForPath(track.path)
      if (persistedMv?.id && persistedMv?.source) {
        selectedMv = {
          id: persistedMv.id,
          source: persistedMv.source,
          title: persistedMv.title || '',
          author: persistedMv.author || ''
        }
      }

      if (!selectedMv) {
        const sourceMv = resolveDownloadedSourceMv({
          mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
          sourceUrl: track.sourceUrl || track.mvOriginUrl
        })
        if (sourceMv?.id && sourceMv?.source) {
          selectedMv = { id: sourceMv.id, source: sourceMv.source }
        }
      }

      if (!selectedMv) {
        const mvSearchContext = { title, artist: artist || '' }
        const mvSearchContextKey = `${title.toLowerCase()}::${String(artist || '').toLowerCase()}`
        const mvQueries =
          mvSource === 'bilibili'
            ? buildBilibiliAutoMvQueries(title, artist || '')
            : buildYoutubeAutoMvQueries(title, artist || '')

        for (const mvQuery of mvQueries) {
          const normalizedQuery = String(mvQuery || '').trim()
          if (!normalizedQuery) continue
          const searchCacheKey = `${track.path}::${mvSource}::${normalizedQuery.toLowerCase()}::${mvSearchContextKey}`
          let searchResult = autoMvSearchByTrackRef.current.get(searchCacheKey)
          if (searchResult === undefined) {
            searchResult = await searchMvWithCache(normalizedQuery, mvSource, mvSearchContext)
            autoMvSearchByTrackRef.current.set(searchCacheKey, searchResult || null)
          }
          const items = orderMvSearchItems(searchResult, mvSource)
          if (items.length === 0) continue
          const hit =
            getAutoMvSearchHit(searchResult, mvSource) ||
            getBestEffortMvSearchHit(searchResult, mvSource)
          const resultMeta =
            hit?.result && typeof hit.result === 'object' ? hit.result : items[0] || {}
          const selectedId = hit?.id || items[0]?.id
          if (!selectedId) continue
          selectedMv = {
            id: selectedId,
            source: hit?.source || items[0]?.source || mvSource,
            title: resultMeta.title || '',
            author: resultMeta.author || ''
          }
          break
        }
      }

      if (!selectedMv?.id) return false
      if (selectedMv.source === 'bilibili') {
        const qMap = { ultra: 120, highfps: 116, high: 80, medium: 64, low: 16 }
        const qn = qMap[configRef.current.mvQuality || 'high'] || 80
        await resolveBiliDirectStreamCached(selectedMv.id, qn).catch(() => null)
      }
      console.log(`[MV] preloaded next track MV: ${track.path}`)
      return true
    },
    [resolveBiliDirectStreamCached, searchMvWithCache]
  )

  const retryFetchLyrics = async () => {
    const track = playlist[currentIndex]
    if (!track) return
    const sourceOverride = getLyricsSourcePreferenceForPath(track.path)
    clearLyricsOverrideForPath(track.path)
    if (sourceOverride) {
      setLyricsSourcePreferenceForPath(track.path, sourceOverride)
      setLyricsSourcePreferenceRevision((value) => value + 1)
    }
    const metaTitle = metadata.title || (track ? stripExtension(track.name) : '')
    const metaArtist = metadata.artist || track?.info?.artist || ''
    try {
      await fetchLyrics(track.path, metaTitle, metaArtist, {
        album: track.info?.album || '',
        embeddedLyrics: track.info?.lyrics || null,
        mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
        sourceUrl: track.sourceUrl || track.mvOriginUrl,
        sourceOverride
      })
    } catch (e) {
      console.error('Retry fetchLyrics error', e)
    }
  }

  const handleLyricsInstrumentalToggle = useCallback(
    (nextValue) => {
      const track = playlistRef.current[currentIndexRef.current]
      if (!track?.path) return

      setLyricsInstrumentalFlagForPath(track.path, nextValue === true)
      setLyricsInstrumentalRevision((value) => value + 1)
      setLyricsQuickBarDismissed(false)
      setLyricsQuickBarActivityAt(Date.now())

      if (nextValue === true) {
        lyricsRequestSeqRef.current += 1
        lyricsLoadedTrackPathRef.current = ''
        lyricsMatchStatusRef.current = 'none'
        setLyrics([])
        setRomajiDisplayLines([])
        setActiveLyricIndex(-1)
        setLyricsMatchStatus('none')
        setLyricsSourceStatus({ kind: 'none', detail: 'instrumental', origin: '' })
        return
      }

      if (!lyricsLoadSurfaceActiveRef.current) {
        lyricsMatchStatusRef.current = 'idle'
        setLyricsMatchStatus('idle')
        setLyricsSourceStatus({ kind: 'idle', detail: '', origin: '' })
        return
      }

      const metaTitle = metadata.title || stripExtension(track.name || '')
      const metaArtist = metadata.artist || track?.info?.artist || ''
      fetchLyrics(track.path, metaTitle, metaArtist, {
        album: track.info?.album || '',
        embeddedLyrics: track.info?.lyrics || trackMetaMapRef.current?.[track.path]?.lyrics || null,
        hasLyrics: track.hasLyrics === true,
        mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
        sourceUrl: track.sourceUrl || track.mvOriginUrl,
        sourceOverride: getLyricsSourcePreferenceForPath(track.path)
      }).catch((e) => console.error('Lyrics instrumental toggle refresh error', e))
    },
    [metadata.artist, metadata.title]
  )

  const fetchLyricsFromSourceLink = async () => {
    const link = (configRef.current.lyricsSourceLink || '').trim()
    if (!link) return
    setLyrics([])
    setActiveLyricIndex(-1)
    setLyricsMatchStatus('loading')
    setLyricsSourceStatus({ kind: 'loading', detail: '', origin: '' })
    try {
      if (await tryApplyLyricsBySourceLink(link)) return
    } catch (e) {
      console.warn('[lyrics] manual source link fetch failed:', e?.message || e)
    }
    setLyrics([{ time: 0, text: i18n.t('lyrics.none') }])
    setLyricsMatchStatus('none')
    setLyricsSourceStatus({ kind: 'none', detail: '', origin: '' })
  }

  const showLyricsDropMessage = useCallback((message) => {
    setLyricsDropMessage(message)
    if (lyricsDropMessageTimerRef.current) {
      clearTimeout(lyricsDropMessageTimerRef.current)
    }
    lyricsDropMessageTimerRef.current = setTimeout(() => {
      setLyricsDropMessage('')
      lyricsDropMessageTimerRef.current = null
    }, 2200)
  }, [])

  const applyLyricsFromText = useCallback((raw, sourceMeta = {}) => {
    const parsed = parseAnyLyrics(raw)
    if (parsed.length > 0) {
      setLyrics(parsed)
      setLyricsMatchStatus('matched')
      setActiveLyricIndex(-1)
      setLyricsSourceStatus({
        kind: 'manual',
        detail: '',
        origin: typeof sourceMeta.origin === 'string' ? sourceMeta.origin : ''
      })
      const path = playlistRef.current[currentIndexRef.current]?.path
      if (path && typeof raw === 'string' && raw.trim()) {
        setLyricsOverrideForPath(path, raw, {
          source: 'manual',
          origin: typeof sourceMeta.origin === 'string' ? sourceMeta.origin : '',
          preferredSource: 'manual'
        })
        setLyricsSourcePreferenceRevision((value) => value + 1)
      }
      return true
    }
    return false
  }, [])

  const handleLyricsDropDragEnter = useCallback((e) => {
    const file = getDroppedLyricsFile(e.dataTransfer)
    if (!file && !hasDroppedFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    lyricsDropDepthRef.current += 1
    setLyricsDropActive(true)
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleLyricsDropDragOver = useCallback((e) => {
    const file = getDroppedLyricsFile(e.dataTransfer)
    if (!file && !hasDroppedFiles(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    setLyricsDropActive(true)
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleLyricsDropDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    lyricsDropDepthRef.current = Math.max(0, lyricsDropDepthRef.current - 1)
    if (lyricsDropDepthRef.current === 0) {
      setLyricsDropActive(false)
    }
  }, [])

  const handleLyricsDrop = useCallback(
    async (e) => {
      const file = getDroppedLyricsFile(e.dataTransfer)
      if (!file && !hasDroppedFiles(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      lyricsDropDepthRef.current = 0
      setLyricsDropActive(false)

      if (!file) {
        showLyricsDropMessage(t('lyrics.dropLrcUnsupported'))
        return
      }

      const track = playlistRef.current[currentIndexRef.current]
      if (!track?.path) {
        showLyricsDropMessage(t('lyrics.dropLrcNoTrack'))
        return
      }

      try {
        const text = await readDroppedLyricsFile(file, window.api)
        if (!text.trim()) {
          showLyricsDropMessage(t('lyrics.dropLrcEmpty'))
          return
        }
        const applied = applyLyricsFromText(text, {
          origin: file?.name ? `drop:${file.name}` : 'drop'
        })
        if (!applied) {
          showLyricsDropMessage(t('lyrics.dropLrcInvalid'))
          return
        }
        setLyricsQuickBarDismissed(false)
        setLyricsQuickBarActivityAt(Date.now())
        showLyricsDropMessage(t('lyrics.dropLrcLoaded'))
      } catch (error) {
        console.warn('[lyrics] drop lrc failed:', error)
        showLyricsDropMessage(t('lyrics.dropLrcReadFailed'))
      }
    },
    [applyLyricsFromText, showLyricsDropMessage, t]
  )

  useEffect(() => {
    return () => {
      if (lyricsDropMessageTimerRef.current) {
        clearTimeout(lyricsDropMessageTimerRef.current)
      }
    }
  }, [])

  const pickLyricsFileNative = useCallback(async () => {
    if (!window.api?.openLyricsFileHandler || !window.api?.readBufferHandler) return
    const path = await window.api.openLyricsFileHandler(configRef.current.uiLocale)
    if (!path) return
    const buf = await window.api.readBufferHandler(path)
    if (!buf) return
    let u8
    if (buf instanceof Uint8Array) u8 = buf
    else if (buf instanceof ArrayBuffer) u8 = new Uint8Array(buf)
    else if (Array.isArray(buf)) u8 = new Uint8Array(buf)
    else if (buf?.data && Array.isArray(buf.data)) u8 = new Uint8Array(buf.data)
    else u8 = new Uint8Array(buf)
    const text = new TextDecoder('utf-8').decode(u8)
    applyLyricsFromText(text, { origin: 'local' })
  }, [applyLyricsFromText])

  const lrcLibCache = useRef(new Map())
  const lrcLibPendingRef = useRef(new Map())

  const requestLrcLib = async (url) => {
    if (lrcLibCache.current.has(url)) return lrcLibCache.current.get(url)
    if (lrcLibPendingRef.current.has(url)) return lrcLibPendingRef.current.get(url)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LRCLIB_REQUEST_TIMEOUT_MS)
    const task = fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null
        const data = await response.json()
        lrcLibCache.current.set(url, data)
        if (lrcLibCache.current.size > MAX_LRCLIB_CACHE_ENTRIES) {
          const firstKey = lrcLibCache.current.keys().next().value
          lrcLibCache.current.delete(firstKey)
        }
        return data
      })
      .catch(() => null)
      .finally(() => {
        clearTimeout(timeoutId)
        lrcLibPendingRef.current.delete(url)
      })

    lrcLibPendingRef.current.set(url, task)
    return task
  }

  const searchLyricsCandidates = async (customQuery) => {
    const searchSeq = ++lyricsCandidateSearchSeqRef.current
    const track = playlist[currentIndex]
    if (!track) return
    const metaTitle = metadata.title || stripExtension(track.name) || ''
    const metaArtist = metadata.artist || track?.info?.artist || ''
    const title = (cleanTitleForSearch(metaTitle) || metaTitle || '').trim()
    if (!title && !customQuery) return

    setLyricsCandidateLoading(true)
    setLyricsCandidateOpen(true)
    setLyricsCandidateItems([])
    try {
      const titleVariants = buildLyricTitleVariants(title)
      if (titleVariants.length === 0 && !customQuery) return

      const globalParenHints = extractParenArtistHints(title)
      const coverArtistRaw = (metaArtist || '').trim()
      const coverArtistClean = cleanArtistForLyrics(coverArtistRaw)
      const audioDur = audioRef.current?.duration || duration || 0

      const rankOpts = {
        titleCandidates: customQuery ? [customQuery] : titleVariants,
        artistCandidates: customQuery
          ? []
          : [...globalParenHints, coverArtistClean, coverArtistRaw].filter(Boolean)
      }
      const q = customQuery || `${titleVariants[0]} ${coverArtistClean || coverArtistRaw}`.trim()
      const sourcePreference = configRef.current.lyricsSource || DEFAULT_CONFIG.lyricsSource
      const externalSources =
        sourcePreference === 'qq'
          ? ['qq']
          : sourcePreference === 'kugou' ||
              sourcePreference === 'kuwo'
            ? [sourcePreference]
            : ['qq', 'kugou', 'kuwo']
      const hasSyncedLrcTimeTags = (value) =>
        /\[(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.:]\d{2,3})?\]/.test(String(value || ''))

      const lrclibPromise = Promise.all([
        requestLrcLib(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`),
        coverArtistClean && titleVariants[0] && q !== titleVariants[0]
          ? requestLrcLib(`https://lrclib.net/api/search?q=${encodeURIComponent(titleVariants[0])}`)
          : Promise.resolve(null)
      ])
        .then(([data1, data2]) => {
          const seen = new Set()
          const merged = []
          for (const item of [
            ...(Array.isArray(data1) ? data1 : []),
            ...(Array.isArray(data2) ? data2 : [])
          ]) {
            const id = item?.id ?? item?.trackName
            if (id && seen.has(id)) continue
            if (id) seen.add(id)
            merged.push(item)
          }
          const ranked = rankLrcLibCandidates(merged, audioDur, rankOpts)
          return ranked.slice(0, 30).map((r, i) => {
            const tn = r.item?.trackName || r.item?.track_name || ''
            const an = r.item?.artistName || r.item?.artist_name || ''
            return {
              key: `lrclib-${i}-${tn}`,
              source: 'lrclib',
              title: tn || '-',
              subtitle: an || '-',
              badge: `LRCLIB -${r.score.toFixed(0)}`,
              raw: r.chosenLyrics
            }
          })
        })
        .catch(() => [])

      const neteasePromise = window.api?.neteaseSearch
        ? window.api
            .neteaseSearch(q)
            .then((songs) => {
              if (!songs?.length) return []
              const normTitle = (titleVariants[0] || '').toLowerCase().replace(/\s+/g, '')
              const normArtist = (coverArtistClean || coverArtistRaw || '')
                .toLowerCase()
                .replace(/\s+/g, '')
              const rawKw = (metaTitle || '').toLowerCase()

              const scored = songs
                .map((s) => {
                  const sName = (s.name || '').toLowerCase().replace(/\s+/g, '')
                  const sArtist = (s.artists || '').toLowerCase().replace(/\s+/g, '')
                  const sAll = sName + ' ' + sArtist + ' ' + (s.album || '').toLowerCase()
                  const durSec = typeof s.duration === 'number' ? s.duration / 1000 : 0

                  let score = 0

                  if (sName === normTitle) score += 50
                  else if (sName.includes(normTitle) && normTitle.length >= 2) score += 25
                  else if (normTitle.includes(sName) && sName.length >= 2) score += 15
                  else score -= 20

                  if (normArtist && sArtist.includes(normArtist)) score += 40
                  else if (normArtist && normArtist.includes(sArtist) && sArtist.length >= 2)
                    score += 20

                  if (durSec > 0 && audioDur > 0) {
                    const diff = Math.abs(durSec - audioDur)
                    if (diff <= 5) score += 20
                    else if (diff <= 15) score += 10
                    else if (diff > 60) score -= 10
                  }

                  const badVariants = [
                    { terms: ['instrumental', 'inst', 'off vocal', 'karaoke'], penalty: -60 },
                    { terms: ['dj', 'remix'], penalty: -30 },
                    { terms: ['live'], penalty: -15 }
                  ]
                  for (const { terms, penalty } of badVariants) {
                    const userWants = terms.some((t) => rawKw.includes(t))
                    if (!userWants && terms.some((t) => sAll.includes(t))) score += penalty
                  }

                  return { s, score }
                })
                .filter(({ score }) => score > -30)
                .sort((a, b) => b.score - a.score)

              return scored.slice(0, 20).map(({ s, score }) => ({
                key: `ne-${s.id}`,
                source: 'netease',
                title: s.name || '-',
                subtitle: s.artists || '-',
                badge:
                  typeof s.duration === 'number' && s.duration > 0
                    ? `NetEase -${(s.duration / 1000).toFixed(0)}s -${score}`
                    : `NetEase -${score}`,
                songId: s.id
              }))
            })
            .catch(() => [])
        : Promise.resolve([])

      const externalPromise = window.api?.searchExternalLyrics
        ? window.api
            .searchExternalLyrics({
              keywords: q,
              durationSec: audioDur,
              sources: externalSources
            })
            .then((res) => {
              const items = Array.isArray(res?.items) ? res.items : []
              const ranked = rankLrcLibCandidates(items, audioDur, rankOpts)
              return ranked.slice(0, 24).map((r, i) => {
                const item = r.item || {}
                const source = item.source || 'external'
                const sourceName =
                  source === 'qq'
                    ? 'QQ'
                    : source === 'kugou'
                      ? 'Kugou'
                      : source === 'kuwo'
                        ? 'Kuwo'
                        : source
                const raw = r.chosenLyrics || item.syncedLyrics || item.plainLyrics || ''
                if (!hasSyncedLrcTimeTags(raw)) return null
                return {
                  key: `${source}-${i}-${item.providerId || item.trackName || i}`,
                  source,
                  title: item.trackName || '-',
                  subtitle: item.artistName || '-',
                  badge: `${sourceName} -${r.score.toFixed(0)}`,
                  raw
                }
              })
                .filter(Boolean)
            })
            .catch(() => [])
        : Promise.resolve([])

      const sourceItems = new Map()
      const completedSources = []
      const publishSourceItems = (source, items) => {
        if (searchSeq !== lyricsCandidateSearchSeqRef.current) return
        const nextItems = Array.isArray(items) ? items : []
        if (!sourceItems.has(source)) completedSources.push(source)
        sourceItems.set(source, nextItems)
        const seen = new Set()
        const merged = []
        for (const doneSource of completedSources) {
          for (const item of sourceItems.get(doneSource) || []) {
            const key = item?.key || `${item?.source || doneSource}-${item?.title || ''}-${item?.subtitle || ''}`
            if (seen.has(key)) continue
            seen.add(key)
            merged.push(item)
          }
        }
        setLyricsCandidateItems(merged)
      }

      await Promise.allSettled([
        lrclibPromise.then((items) => publishSourceItems('lrclib', items)),
        neteasePromise.then((items) => publishSourceItems('netease', items)),
        externalPromise.then((items) => publishSourceItems('external', items))
      ])
    } finally {
      if (searchSeq === lyricsCandidateSearchSeqRef.current) {
        setLyricsCandidateLoading(false)
      }
    }
  }

  const openLyricsCandidatePicker = () => {
    setLyricsQuickBarDismissed(false)
    setLyricsQuickBarActivityAt(Date.now())
    searchLyricsCandidates()
  }

  const handleLyricsCandidatePick = async (row) => {
    const track = playlist[currentIndex]
    if (!track) return
    try {
      if (['lrclib', 'qq', 'kugou', 'kuwo'].includes(row.source) && row.raw) {
        const parsed = parseAnyLyrics(row.raw)
        if (parsed.length > 0) {
          setLyrics(parsed)
          setLyricsMatchStatus('matched')
          setActiveLyricIndex(-1)
          setLyricsSourceStatus({ kind: 'manual', detail: '', origin: row.source })
          setLyricsOverrideForPath(track.path, row.raw, {
            source: 'manual',
            origin: row.source,
            preferredSource: 'manual'
          })
          setLyricsSourcePreferenceRevision((value) => value + 1)
        }
        return
      }
      if (row.source === 'netease' && row.songId && window.api?.fetchNeteaseLyrics) {
        const res = await window.api.fetchNeteaseLyrics({ songId: row.songId })
        if (res?.ok && res.lrc) {
          const parsed = parseAnyLyrics(res.lrc)
          if (parsed.length > 0) {
            setLyrics(parsed)
            setLyricsMatchStatus('matched')
            setActiveLyricIndex(-1)
            setLyricsSourceStatus({ kind: 'manual', detail: '', origin: 'netease' })
            setLyricsOverrideForPath(track.path, res.lrc, {
              source: 'manual',
              origin: 'netease',
              preferredSource: 'manual'
            })
            setLyricsSourcePreferenceRevision((value) => value + 1)
          }
        }
      }
    } catch (e) {
      console.error('[lyrics] candidate pick', e)
    }
  }

  const tryApplyLyricsBySourceLink = async (rawLink) => {
    const parsed = parseLyricsSourceLink(rawLink)
    if (!parsed?.url) return false

    // NetEase supports direct songId lookup via main-process API.
    if (parsed.provider === 'netease' && parsed.songId && window.api?.fetchNeteaseLyrics) {
      const res = await window.api.fetchNeteaseLyrics({ songId: parsed.songId })
      if (res?.ok && res.lrc) {
        const rows = parseAnyLyrics(res.lrc)
        if (rows.length > 0) {
          setLyrics(rows)
          setLyricsMatchStatus('matched')
          setActiveLyricIndex(-1)
          setLyricsSourceStatus({ kind: 'link', detail: '', origin: 'netease' })
          const p = playlistRef.current[currentIndexRef.current]?.path
          if (p) {
            setLyricsOverrideForPath(p, res.lrc, {
              source: 'link',
              origin: 'netease',
              preferredSource: 'manual'
            })
            setLyricsSourcePreferenceRevision((value) => value + 1)
          }
          return true
        }
      }
    }

    // Other music links: fallback to LRCLIB keyword search (best effort).
    const lib = await requestLrcLib(
      `https://lrclib.net/api/search?q=${encodeURIComponent(parsed.url)}`
    )
    const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null
    const expectedTitle =
      metadata.title || (currentTrack?.name ? stripExtension(currentTrack.name) : '') || ''
    const expectedArtist = metadata.artist || currentTrack?.info?.artist || ''
    const raw = pickLyricsFromLrcLibResult(lib, audioRef.current?.duration || duration || 0, {
      titleCandidates: buildLyricTitleVariants(expectedTitle),
      artistCandidates: [cleanArtistForLyrics(expectedArtist), expectedArtist]
    })
    const rows = parseAnyLyrics(raw)
    if (rows.length > 0) {
      setLyrics(rows)
      setLyricsMatchStatus('matched')
      setActiveLyricIndex(-1)
      setLyricsSourceStatus({ kind: 'link', detail: '', origin: 'lrclib' })
      if (currentTrack?.path && raw?.trim()) {
        setLyricsOverrideForPath(currentTrack.path, raw, {
          source: 'link',
          origin: 'lrclib',
          preferredSource: 'manual'
        })
        setLyricsSourcePreferenceRevision((value) => value + 1)
      }
      return true
    }
    return false
  }

  const fetchLyrics = async (filePath, title, artist, hints = {}) => {
    const requestSeq = ++lyricsRequestSeqRef.current
    const mvRequestSeq = Number.isFinite(Number(hints?.mvRequestSeq))
      ? Number(hints.mvRequestSeq)
      : trackLoadSeqRef.current
    const isStaleRequest = () => requestSeq !== lyricsRequestSeqRef.current
    let lyricsResultApplied = false
    const applyLyricsResult = (rows, matchStatus, sourceStatus) => {
      if (isStaleRequest() || lyricsResultApplied) return true
      lyricsResultApplied = true
      lyricsLoadedTrackPathRef.current = matchStatus === 'matched' ? filePath : ''
      lyricsMatchStatusRef.current = matchStatus
      setLyrics(rows)
      setLyricsMatchStatus(matchStatus)
      setLyricsSourceStatus(sourceStatus)
      return false
    }

    const hasPreservedMatchedLyrics =
      hints?.preserveExisting === true &&
      lyricsLoadedTrackPathRef.current === filePath &&
      lyricsMatchStatusRef.current === 'matched'

    if (getLyricsInstrumentalFlagForPath(filePath)) {
      applyLyricsResult([], 'none', {
        kind: 'none',
        detail: 'instrumental',
        origin: ''
      })
      setActiveLyricIndex(-1)
      return
    }

    if (!hasPreservedMatchedLyrics) {
      lyricsLoadedTrackPathRef.current = ''
      lyricsMatchStatusRef.current = 'loading'
      setLyrics([])
      setActiveLyricIndex(-1)
      setLyricsMatchStatus('loading')
      setLyricsSourceStatus({ kind: 'loading', detail: '', origin: '' })
    }

    if (
      hints?.allowMvSearch !== false &&
      mvLoadSurfaceActiveRef.current &&
      window.api.searchMVHandler
    ) {
      window.setTimeout(() => {
        if (isStaleRequest() || mvRequestSeq !== trackLoadSeqRef.current) return
        searchAndApplyMvForTrack({ filePath, title, artist, hints, requestSeq: mvRequestSeq })
      }, MV_SEARCH_PLAYBACK_START_DELAY_MS)
    }

    const tryApplyEmbeddedLyrics = () => {
      if (!hints?.embeddedLyrics) return false
      const embeddedParsed = parseAnyLyrics(hints.embeddedLyrics)
      if (embeddedParsed.length > 0) {
        if (
          applyLyricsResult(embeddedParsed, 'matched', {
            kind: 'embedded',
            detail: '',
            origin: ''
          })
        )
          return true
        return true
      }
      return false
    }

    const tryApplySidecarLyrics = async () => {
      if (!window.api?.readLyricsHandler) return false
      const expectSidecarLyrics = hints?.hasLyrics === true
      const localReadAttempts = expectSidecarLyrics ? 2 : 1
      const localRetryDelayMs = expectSidecarLyrics ? 80 : 0

      for (let attempt = 0; attempt < localReadAttempts; attempt++) {
        const localLrc = await window.api.readLyricsHandler(filePath)
        if (isStaleRequest()) return true
        if (localLrc) {
          const parsed = parseAnyLyrics(localLrc)
          if (parsed.length > 0) {
            if (applyLyricsResult(parsed, 'matched', { kind: 'local', detail: '', origin: '' })) {
              return true
            }
            return true
          }
        }
        if (attempt < localReadAttempts - 1) {
          await wait(localRetryDelayMs)
          if (isStaleRequest()) return true
        }
      }
      return false
    }

    const tryConfiguredLocalLyrics = async () => {
      const localSourceOrder = getLocalLyricsSourceOrder(configRef.current.localLyricsPriority)
      for (const source of localSourceOrder) {
        try {
          if (source === 'embedded' && tryApplyEmbeddedLyrics()) return true
          if (source === 'lrc' && (await tryApplySidecarLyrics())) return true
        } catch (e) {
          if (source === 'lrc') console.error('Local LRC error', e)
          else console.error('Embedded lyrics error', e)
        }
        if (isStaleRequest()) return true
      }
      return false
    }

    const audioDur = audioRef.current?.duration || duration || 0
    const skipAutoOnlineLyrics = isLikelyInstrumentalTrack({
      title,
      artist,
      filePath
    })
    const isStreamingTrack = isStreamingTrackPath(filePath)

    if (isStreamingTrack) {
      try {
        const playlistTrack =
          hints?.streamingTrack ||
          playlistRef.current.find((track) => track.path === filePath) ||
          null
        const streamingTrack = {
          ...(playlistTrack || {}),
          ...(playlistTrack?.info || {}),
          provider:
            playlistTrack?.provider ||
            playlistTrack?.streamingProvider ||
            playlistTrack?.info?.streamingProvider ||
            '',
          providerLabel:
            playlistTrack?.providerLabel ||
            playlistTrack?.info?.source ||
            playlistTrack?.streamingProvider ||
            '',
          sourceId: playlistTrack?.sourceId || playlistTrack?.raw?.id || '',
          title,
          artist,
          album: hints?.album || playlistTrack?.album || playlistTrack?.info?.album || '',
          duration: audioDur || playlistTrack?.duration || playlistTrack?.info?.duration || 0
        }
        const res = await window.api?.streaming?.fetchLyrics?.(streamingTrack)
        if (isStaleRequest()) return
        if (res?.ok && res.lrc) {
          const parsed = parseAnyLyrics(res.lrc)
          if (parsed.length > 0) {
            if (
              applyLyricsResult(parsed, 'matched', {
                kind: res.source || streamingTrack.provider || 'streaming',
                detail: 'streaming',
                origin: streamingTrack.provider || ''
              })
            )
              return
            return
          }
        }
      } catch (error) {
        console.error('Streaming lyrics error', error)
      }

      applyLyricsResult([{ time: 0, text: i18n.t('lyrics.none') }], 'none', {
        kind: 'none',
        detail: 'streaming',
        origin: ''
      })
      return
    }

    const savedOverride = getLyricsOverrideForPath(filePath)
    const savedSourcePreference = getLyricsSourcePreferenceForPath(filePath)
    let lyricsSource =
      normalizeLyricsSourcePreference(hints?.sourceOverride) ||
      savedSourcePreference ||
      normalizeLyricsSourcePreference(configRef.current.lyricsSource) ||
      DEFAULT_CONFIG.lyricsSource
    if (lyricsSource === 'manual' && !savedOverride?.raw) {
      lyricsSource =
        normalizeLyricsSourcePreference(configRef.current.lyricsSource) ||
        DEFAULT_CONFIG.lyricsSource
    }
    const requestedSourcePreference =
      normalizeLyricsSourcePreference(hints?.sourceOverride) || savedSourcePreference
    const getCachePreferredSource = (matchedSource) => {
      if (requestedSourcePreference && requestedSourcePreference !== 'manual') {
        return requestedSourcePreference
      }
      return normalizeLyricsSourcePreference(matchedSource)
    }
    const cacheMatchedOnlineLyrics = (raw, matchedSource, origin = '') => {
      if (isStaleRequest() || lyricsResultApplied) return
      if (!raw || !String(raw).trim()) return
      setLyricsOverrideForPath(filePath, raw, {
        source: matchedSource,
        origin,
        preferredSource: getCachePreferredSource(matchedSource)
      })
      setLyricsSourcePreferenceRevision((value) => value + 1)
    }
    const savedOverrideSource = normalizeLyricsSourcePreference(savedOverride?.source)
    const savedOverrideOrigin = normalizeLyricsSourcePreference(savedOverride?.origin)
    const savedOverrideMatchesSource =
      !!savedOverride?.raw &&
      lyricsSource !== 'local' &&
      (lyricsSource === 'manual' ||
        !savedSourcePreference ||
        savedOverrideSource === lyricsSource ||
        savedOverrideOrigin === lyricsSource)

    if (
      savedOverride?.raw &&
      savedOverrideMatchesSource &&
      !(skipAutoOnlineLyrics && isOnlineLyricsOverrideSource(savedOverride.source))
    ) {
      const parsedOv = parseAnyLyrics(savedOverride.raw)
      if (parsedOv.length > 0) {
        if (
          applyLyricsResult(parsedOv, 'matched', {
            kind: 'cache',
            detail: savedOverride.source || 'manual',
            origin: savedOverride.origin || ''
          })
        )
          return
        return
      }
    }

    if (lyricsSource === 'local' && (await tryConfiguredLocalLyrics())) return

    if (skipAutoOnlineLyrics) {
      if (savedOverride?.raw && isOnlineLyricsOverrideSource(savedOverride.source)) {
        clearLyricsOverrideForPath(filePath)
      }
      applyLyricsResult([{ time: 0, text: i18n.t('lyrics.none') }], 'none', {
        kind: 'none',
        detail: 'instrumental',
        origin: ''
      })
      return
    }

    const useOnlineLyrics =
      lyricsSource !== 'local' &&
      lyricsSource !== 'manual' &&
      [
        'lrclib',
        'netease',
        'qq',
        'kugou',
        'kuwo'
      ].includes(lyricsSource)

    if (title && useOnlineLyrics) {
      try {
        const titleVariants = buildLyricTitleVariants(title)
        if (titleVariants.length === 0) throw new Error('empty lyrics title')
        const globalParenHints = extractParenArtistHints(title)
        const coverArtistRaw = (artist || '').trim()
        const coverArtistClean = cleanArtistForLyrics(coverArtistRaw)
        const albumName = hints?.album || ''
        const lyricsRankOptions = {
          titleCandidates: titleVariants,
          rawTitle: title,
          artistCandidates: [...globalParenHints, coverArtistClean, coverArtistRaw].filter(Boolean)
        }

        const applyLrcLibPayload = (payload) => {
          const raw = pickLyricsFromLrcLibResult(payload, audioDur, lyricsRankOptions)
          const parsed = parseAnyLyrics(raw)
          if (parsed.length > 0) {
            cacheMatchedOnlineLyrics(raw, 'lrclib')
            if (
              applyLyricsResult(parsed, 'matched', {
                kind: 'lrclib',
                detail: '',
                origin: ''
              })
            )
              return true
            return true
          }
          return false
        }

        const getFromLib = async (trackName, artistName) => {
          const params = new URLSearchParams({ track_name: trackName })
          if (artistName) params.set('artist_name', artistName)
          if (albumName) params.set('album_name', albumName)
          return requestLrcLib(`https://lrclib.net/api/get?${params.toString()}`)
        }

        const searchLib = (q) =>
          requestLrcLib(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)

        const triedGet = new Set()
        const tryGet = async (tn, an) => {
          const key = `${tn}\0${an}`
          if (triedGet.has(key)) return false
          triedGet.add(key)
          const data = await getFromLib(tn, an)
          if (isStaleRequest()) return true
          return applyLrcLibPayload(data)
        }

        const triedSearch = new Set()
        const trySearch = async (q) => {
          const key = (q || '').trim()
          if (!key || triedSearch.has(key)) return false
          triedSearch.add(key)
          const data = await searchLib(key)
          if (isStaleRequest()) return true
          return applyLrcLibPayload(data)
        }

        const waitForFirstLyricsHit = (attempts) =>
          new Promise((resolve) => {
            let pending = attempts.length
            if (pending === 0) {
              resolve(false)
              return
            }
            attempts.forEach((attempt) => {
              attempt
                .then((hit) => {
                  if (hit) {
                    resolve(true)
                    return
                  }
                  pending -= 1
                  if (pending === 0) resolve(false)
                })
                .catch(() => {
                  pending -= 1
                  if (pending === 0) resolve(false)
                })
            })
          })

        const runWithLyricsAttemptTimeout = (runner, timeoutMs = STRICT_LYRICS_SOURCE_TIMEOUT_MS) =>
          new Promise((resolve) => {
            let settled = false
            const finish = (value) => {
              if (settled) return
              settled = true
              resolve(value === true)
            }
            const timeoutId = setTimeout(() => finish(false), timeoutMs)
            Promise.resolve()
              .then(runner)
              .then((value) => {
                clearTimeout(timeoutId)
                finish(value)
              })
              .catch(() => {
                clearTimeout(timeoutId)
                finish(false)
              })
          })

        const runFirstSuccessfulLyricsAttempt = (attempts, timeoutMs = STRICT_LYRICS_SOURCE_TIMEOUT_MS) =>
          new Promise((resolve) => {
            const activeAttempts = (attempts || []).filter((attempt) => typeof attempt?.run === 'function')
            if (activeAttempts.length === 0) {
              resolve(false)
              return
            }

            let settled = false
            let completed = 0
            const timers = []
            const finish = (value) => {
              if (settled) return
              settled = true
              for (const timer of timers) clearTimeout(timer)
              resolve(value === true)
            }
            timers.push(setTimeout(() => finish(false), timeoutMs))

            activeAttempts.forEach((attempt) => {
              const timer = setTimeout(() => {
                Promise.resolve()
                  .then(attempt.run)
                  .then((hit) => {
                    if (hit) {
                      finish(true)
                      return
                    }
                    completed += 1
                    if (completed === activeAttempts.length) finish(false)
                  })
                  .catch(() => {
                    completed += 1
                    if (completed === activeAttempts.length) finish(false)
                  })
              }, Math.max(0, Number(attempt.delayMs) || 0))
              timers.push(timer)
            })
          })

        const runLrcLibAttempts = async () => {
          for (const cleanedTitle of titleVariants) {
            const parenHints = [
              ...new Set([...globalParenHints, ...extractParenArtistHints(cleanedTitle)])
            ]

            const firstArtist =
              parenHints[0] ||
              (coverArtistRaw !== 'Unknown Artist' ? coverArtistRaw : '') ||
              coverArtistClean ||
              ''
            const firstSearchQ = firstArtist
              ? `${cleanedTitle} ${firstArtist}`.trim()
              : cleanedTitle

            const firstWaveHit = await waitForFirstLyricsHit([
              tryGet(cleanedTitle, firstArtist),
              trySearch(firstSearchQ)
            ])
            if (firstWaveHit) return true
            if (isStaleRequest()) return false

            for (const hint of parenHints.slice(1)) {
              if (await tryGet(cleanedTitle, hint)) return true
            }
            if (
              coverArtistRaw &&
              coverArtistRaw !== 'Unknown Artist' &&
              coverArtistRaw !== firstArtist
            ) {
              if (await tryGet(cleanedTitle, coverArtistRaw)) return true
            }
            if (
              coverArtistClean &&
              coverArtistClean !== coverArtistRaw &&
              coverArtistClean !== firstArtist
            ) {
              if (await tryGet(cleanedTitle, coverArtistClean)) return true
            }
            if (await tryGet(cleanedTitle, '')) return true

            for (const hint of parenHints.slice(1)) {
              if (await trySearch(`${cleanedTitle} ${hint}`.trim())) return true
            }
            if (coverArtistRaw && coverArtistRaw !== 'Unknown Artist') {
              if (await trySearch(`${cleanedTitle} ${coverArtistRaw}`.trim())) return true
            }
            if (coverArtistClean && coverArtistClean !== firstSearchQ) {
              if (await trySearch(`${cleanedTitle} ${coverArtistClean}`.trim())) return true
            }
            if ((cleanedTitle || '').length <= 4 && albumName) {
              if (coverArtistClean) {
                if (await trySearch(`${cleanedTitle} ${coverArtistClean} ${albumName}`.trim()))
                  return true
              }
              if (await trySearch(`${cleanedTitle} ${albumName}`.trim())) return true
            }
            if (await trySearch(cleanedTitle)) return true

            const rawTrim = title.trim()
            if (rawTrim && rawTrim !== cleanedTitle) {
              if (
                coverArtistRaw &&
                coverArtistRaw !== 'Unknown Artist' &&
                (await trySearch(`${rawTrim} ${coverArtistRaw}`.trim()))
              ) {
                return true
              }
              if (await trySearch(rawTrim)) return true
            }
          }
          return false
        }

        const tryNeteaseVariants = async () => {
          if (!window.api?.fetchNeteaseLyrics) return false
          const triedKw = new Set()
          // Build queries: prioritize "title artist" combos over bare title
          const allQueries = []
          for (const tv of titleVariants) {
            if (coverArtistClean) allQueries.push(`${tv} ${coverArtistClean}`)
            for (const hint of globalParenHints) {
              allQueries.push(`${tv} ${hint}`.trim())
            }
            if (
              coverArtistRaw &&
              coverArtistRaw !== 'Unknown Artist' &&
              coverArtistRaw !== coverArtistClean
            ) {
              allQueries.push(`${tv} ${coverArtistRaw}`.trim())
            }
            allQueries.push(tv)
          }
          for (const kw of allQueries) {
            const k = (kw || '').trim()
            if (!k || triedKw.has(k)) continue
            triedKw.add(k)
            const res = await window.api.fetchNeteaseLyrics({
              keywords: k,
              rawKeywords: title,
              durationSec: audioDur
            })
            if (isStaleRequest()) return true
            if (res?.rateLimited || res?.error === 'rate_limited') {
              const phaseLabel = res?.phase === 'lyric' ? 'lyrics' : 'search'
              console.warn(
                `[Lyrics NetEase] ${phaseLabel} rate limited; cooling down ${Math.ceil((Number(res.retryAfterMs) || 0) / 1000)}s`
              )
              return false
            }
            if (res?.ok && res.lrc) {
              if (typeof res.confidence === 'number' && res.confidence < 30) {
                console.log(
                  `[Lyrics NetEase] rejected low confidence (${res.confidence}) for "${k}"`
                )
                continue
              }
              const neteaseCandidate = rankLrcLibCandidates(
                [
                  {
                    trackName: res.song?.trackName || '',
                    artistName: res.song?.artistName || '',
                    duration: Number(res.song?.duration) || 0,
                    syncedLyrics: res.lrc
                  }
                ],
                audioDur,
                lyricsRankOptions
              )[0]
              if (!isAutoLyricsCandidateAccepted(neteaseCandidate, lyricsRankOptions)) {
                console.log(`[Lyrics NetEase] rejected weak title/artist match for "${k}"`)
                continue
              }
              const parsed = parseAnyLyrics(res.lrc)
              if (parsed.length >= 3) {
                console.log(`[Lyrics NetEase] matched with "${k}" (${parsed.length} lines)`)
                cacheMatchedOnlineLyrics(res.lrc, 'netease')
                if (
                  applyLyricsResult(parsed, 'matched', {
                    kind: 'netease',
                    detail: '',
                    origin: ''
                  })
                )
                  return true
                return true
              }
            }
          }
          return false
        }

        const hasSyncedLrcTimeTags = (value) =>
          /\[(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.:]\d{2,3})?\]/.test(String(value || ''))

        const tryExternalVariants = async (sources = ['qq', 'kugou', 'kuwo']) => {
          if (!window.api?.searchExternalLyrics) return false
          const triedKw = new Set()
          const queries = []
          for (const tv of titleVariants) {
            if (coverArtistClean) queries.push(`${tv} ${coverArtistClean}`)
            for (const hint of globalParenHints) queries.push(`${tv} ${hint}`.trim())
            if (
              coverArtistRaw &&
              coverArtistRaw !== 'Unknown Artist' &&
              coverArtistRaw !== coverArtistClean
            ) {
              queries.push(`${tv} ${coverArtistRaw}`.trim())
            }
            queries.push(tv)
          }
          for (const kw of queries) {
            const k = (kw || '').trim()
            if (!k || triedKw.has(k)) continue
            triedKw.add(k)
            const res = await window.api.searchExternalLyrics({
              keywords: k,
              durationSec: audioDur,
              sources
            })
            if (isStaleRequest()) return true
            const items = Array.isArray(res?.items) ? res.items : []
            const ranked = rankLrcLibCandidates(items, audioDur, lyricsRankOptions)
            const hit = ranked.find(
              (r) => r?.chosenLyrics && isAutoLyricsCandidateAccepted(r, lyricsRankOptions)
            )
            if (!hit) continue
            const raw = hit?.chosenLyrics || hit?.item?.syncedLyrics || hit?.item?.plainLyrics || ''
            if (!raw) continue
            if (!hasSyncedLrcTimeTags(raw)) continue
            const parsed = parseAnyLyrics(raw)
            if (parsed.length >= 3) {
              const source = hit?.item?.source || sources[0] || 'external'
              cacheMatchedOnlineLyrics(raw, source)
              if (
                applyLyricsResult(parsed, 'matched', {
                  kind: source,
                  detail: '',
                  origin: ''
                })
              )
                return true
              return true
            }
          }
          return false
        }

        const buildDeepSearchQueries = () => {
          const queries = []
          for (const tv of titleVariants) {
            if (coverArtistClean) queries.push(`${tv} ${coverArtistClean}`)
            for (const hint of globalParenHints) queries.push(`${tv} ${hint}`.trim())
            if (
              coverArtistRaw &&
              coverArtistRaw !== 'Unknown Artist' &&
              coverArtistRaw !== coverArtistClean
            ) {
              queries.push(`${tv} ${coverArtistRaw}`.trim())
            }
            queries.push(tv)
          }
          return [...new Set(queries.map((q) => (q || '').trim()).filter(Boolean))].slice(0, 6)
        }

        const applyRankedLyricsCandidate = (candidate, fallbackSource) => {
          if (!candidate || !isAutoLyricsCandidateAccepted(candidate, lyricsRankOptions)) return false
          const raw =
            candidate.chosenLyrics ||
            candidate.item?.syncedLyrics ||
            candidate.item?.plainLyrics ||
            ''
          if (!raw || !hasSyncedLrcTimeTags(raw)) return false
          const parsed = parseAnyLyrics(raw)
          if (parsed.length < 3) return false
          const source = candidate.item?.source || fallbackSource || 'external'
          cacheMatchedOnlineLyrics(raw, source)
          if (
            applyLyricsResult(parsed, 'matched', {
              kind: source,
              detail: configRef.current.lyricsDeepSearchEnabled === true ? 'deep' : '',
              origin: ''
            })
          )
            return true
          return true
        }

        const collectLrcLibCandidates = async () => {
          const queries = buildDeepSearchQueries()
          const jobs = []
          for (const tv of titleVariants.slice(0, 3)) {
            if (coverArtistClean) jobs.push(getFromLib(tv, coverArtistClean))
            if (coverArtistRaw && coverArtistRaw !== coverArtistClean) {
              jobs.push(getFromLib(tv, coverArtistRaw))
            }
          }
          for (const q of queries) jobs.push(searchLib(q))
          const settled = await Promise.allSettled(jobs.slice(0, 10))
          return settled
            .flatMap((result) =>
              result.status === 'fulfilled'
                ? rankLrcLibCandidates(result.value, audioDur, lyricsRankOptions)
                : []
            )
            .map((candidate) => ({
              ...candidate,
              item: { ...(candidate.item || {}), source: 'lrclib' }
            }))
        }

        const collectNeteaseCandidates = async () => {
          if (!window.api?.fetchNeteaseLyrics) return []
          const jobs = buildDeepSearchQueries()
            .slice(0, 5)
            .map((k) =>
              window.api.fetchNeteaseLyrics({
                keywords: k,
                rawKeywords: title,
                durationSec: audioDur
              })
            )
          const settled = await Promise.allSettled(jobs)
          const items = settled
            .map((result) => (result.status === 'fulfilled' ? result.value : null))
            .filter(
              (res) =>
                res?.ok &&
                res.lrc &&
                !(res.rateLimited || res.error === 'rate_limited') &&
                (typeof res.confidence !== 'number' || res.confidence >= 30)
            )
            .map((res) => ({
              source: 'netease',
              trackName: res.song?.trackName || '',
              artistName: res.song?.artistName || '',
              duration: Number(res.song?.duration) || 0,
              syncedLyrics: res.lrc
            }))
          return rankLrcLibCandidates(items, audioDur, lyricsRankOptions)
        }

        const collectExternalCandidates = async () => {
          if (!window.api?.searchExternalLyrics) return []
          const jobs = buildDeepSearchQueries()
            .slice(0, 4)
            .map((k) =>
              window.api.searchExternalLyrics({
                keywords: k,
                durationSec: audioDur,
                sources: ['qq', 'kugou', 'kuwo']
              })
            )
          const settled = await Promise.allSettled(jobs)
          const items = settled.flatMap((result) => {
            if (result.status !== 'fulfilled') return []
            return Array.isArray(result.value?.items) ? result.value.items : []
          })
          return rankLrcLibCandidates(items, audioDur, lyricsRankOptions)
        }

        const runDeepPrioritySearch = async () => {
          const applyBestCollectedCandidate = async (collector) => {
            const ranked = await collector()
            const accepted = (Array.isArray(ranked) ? ranked : [])
              .filter((candidate) => {
                const raw =
                  candidate?.chosenLyrics ||
                  candidate?.item?.syncedLyrics ||
                  candidate?.item?.plainLyrics ||
                  ''
                return hasSyncedLrcTimeTags(raw) && isAutoLyricsCandidateAccepted(candidate, lyricsRankOptions)
              })
              .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score
                if (b.synced !== a.synced) return b.synced ? 1 : -1
                return (a.diff || 0) - (b.diff || 0)
              })
            for (const candidate of accepted) {
              if (applyRankedLyricsCandidate(candidate, candidate.item?.source)) return true
            }
            return false
          }

          return runFirstSuccessfulLyricsAttempt(
            [
              { delayMs: 0, run: () => applyBestCollectedCandidate(collectNeteaseCandidates) },
              { delayMs: 0, run: () => applyBestCollectedCandidate(collectExternalCandidates) },
              {
                delayMs: ONLINE_LYRICS_FALLBACK_RACE_DELAY_MS,
                run: () => applyBestCollectedCandidate(collectLrcLibCandidates)
              }
            ],
            LRCLIB_LYRICS_SOURCE_TIMEOUT_MS
          )
        }

        if (configRef.current.lyricsDeepSearchEnabled === true) {
          if (await runWithLyricsAttemptTimeout(runDeepPrioritySearch, LRCLIB_LYRICS_SOURCE_TIMEOUT_MS)) return
        } else {
          const onlineAttemptBySource = {
            netease: () => tryNeteaseVariants(),
            qq: () => tryExternalVariants(['qq']),
            kugou: () => tryExternalVariants(['kugou']),
            kuwo: () => tryExternalVariants(['kuwo']),
            lrclib: () => runLrcLibAttempts()
          }
          const fallbackOrder = [
            lyricsSource,
            'netease',
            'qq',
            'kugou',
            'kuwo',
            'lrclib'
          ].filter((source, index, arr) => source && arr.indexOf(source) === index)
          const attempts = fallbackOrder
            .map((source, index) => {
              const run = onlineAttemptBySource[source]
              if (!run) return null
              const delayMs =
                index === 0
                  ? 0
                  : index === 1
                    ? ONLINE_LYRICS_FALLBACK_RACE_DELAY_MS
                    : ONLINE_LYRICS_SECOND_FALLBACK_RACE_DELAY_MS
              return { source, delayMs, run }
            })
            .filter(Boolean)
          if (await runFirstSuccessfulLyricsAttempt(attempts, LRCLIB_LYRICS_SOURCE_TIMEOUT_MS)) return
        }
      } catch (e) {
        console.error('Online lyrics error', e)
      }
    }

    if (hasPreservedMatchedLyrics) return

    if (
      applyLyricsResult([{ time: 0, text: i18n.t('lyrics.none') }], 'none', {
        kind: 'none',
        detail: '',
        origin: ''
      })
    )
      return
  }

  useEffect(() => {
    const previousPriority = localLyricsPriorityRef.current
    localLyricsPriorityRef.current = config.localLyricsPriority
    if (previousPriority == null || previousPriority === config.localLyricsPriority) return

    const track = playlist[currentIndex]
    if (!track?.path || isRemoteTrackPath(track.path)) return

    const selectedSource =
      getLyricsSourcePreferenceForPath(track.path) ||
      normalizeLyricsSourcePreference(configRef.current.lyricsSource) ||
      DEFAULT_CONFIG.lyricsSource
    if (selectedSource !== 'local') return
    if (!lyricsLoadSurfaceActiveRef.current) return

    const metaTitle = metadata.title || stripExtension(track.name || '')
    const metaArtist = metadata.artist || track?.info?.artist || ''
    fetchLyrics(track.path, metaTitle, metaArtist, {
      album: track.info?.album || '',
      embeddedLyrics: track.info?.lyrics || trackMetaMapRef.current?.[track.path]?.lyrics || null,
      hasLyrics: track.hasLyrics === true,
      mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
      sourceUrl: track.sourceUrl || track.mvOriginUrl,
      sourceOverride: 'local'
    }).catch((e) => console.error('Local lyrics priority refresh error', e))
  }, [config.localLyricsPriority])

  const handleLyricsSourceChange = useCallback(
    (source) => {
      const nextSource = normalizeLyricsSourcePreference(source)
      if (!nextSource || nextSource === 'manual') return

      configRef.current = {
        ...configRef.current,
        lyricsSource: nextSource
      }
      setConfig((prev) =>
        prev.lyricsSource === nextSource ? prev : { ...prev, lyricsSource: nextSource }
      )

      const track = playlistRef.current[currentIndexRef.current]
      if (!track?.path || isRemoteTrackPath(track.path)) return

      setLyricsSourcePreferenceForPath(track.path, nextSource)
      setLyricsSourcePreferenceRevision((value) => value + 1)
      if (!lyricsLoadSurfaceActiveRef.current) return

      const metaTitle = metadata.title || stripExtension(track.name || '')
      const metaArtist = metadata.artist || track?.info?.artist || ''
      fetchLyrics(track.path, metaTitle, metaArtist, {
        album: track.info?.album || '',
        embeddedLyrics: track.info?.lyrics || trackMetaMapRef.current?.[track.path]?.lyrics || null,
        hasLyrics: track.hasLyrics === true,
        mvOriginUrl: track.mvOriginUrl || track.sourceUrl,
        sourceUrl: track.sourceUrl || track.mvOriginUrl,
        sourceOverride: nextSource
      }).catch((e) => console.error('Lyrics source refresh error', e))
    },
    [metadata.artist, metadata.title, setConfig]
  )

  const loadTrackData = async (filePath, trackHints = {}) => {
    const requestSeq = trackLoadSeqRef.current + 1
    trackLoadSeqRef.current = requestSeq
    cloudCoverFetchSeqRef.current += 1
    coverFailureFetchKeyRef.current = ''
    setCoverUrlTrackPath(filePath)
    setFailedDisplayCoverUrl(null)
    setShareCardSnapshot(null)
    lyricsLoadedTrackPathRef.current = ''
    setLyrics([])
    setActiveLyricIndex(-1)
    if (
      lyricsLoadSurfaceActiveRef.current &&
      (!isRemoteTrackPath(filePath) || isStreamingTrackPath(filePath))
    ) {
      lyricsMatchStatusRef.current = 'loading'
      setLyricsMatchStatus('loading')
      setLyricsSourceStatus({ kind: 'loading', detail: '', origin: '' })
    } else {
      lyricsMatchStatusRef.current = 'idle'
      setLyricsMatchStatus('idle')
      setLyricsSourceStatus({ kind: 'idle', detail: '', origin: '' })
      setIsSearchingMV(false)
    }
    const mvOriginUrlHint = trackHints.mvOriginUrl || trackHints.sourceUrl
    const sourceUrlHint = trackHints.sourceUrl || trackHints.mvOriginUrl

    const getFallbackMetadata = (entry = {}) => {
      const resolvedIdentity = resolveTrackIdentityFromMetadata({
        fileName: filePath.split(/[\\/]/).pop() || '',
        title: entry.title || '',
        artist: entry.artist || '',
        albumArtist: entry.albumArtist || ''
      })
      const resolvedTitle =
        resolvedIdentity.title || entry.title || stripExtension(filePath.split(/[\\/]/).pop() || '')
      const resolvedArtist = resolvedIdentity.artist || 'Unknown Artist'
      return { resolvedTitle, resolvedArtist }
    }

    const rememberDeferredLyricsMvLoad = (
      resolvedTitle,
      resolvedArtist,
      hints = {},
      options = {}
    ) => {
      if (!filePath || !resolvedTitle) return
      lyricsMvDeferredLoadRef.current = {
        filePath,
        title: resolvedTitle,
        artist: resolvedArtist || '',
        hints,
        requestSeq,
        allowLyrics: options.allowLyrics !== false,
        allowMv: options.allowMv !== false
      }
    }

    const loadLyricsForCurrentSurface = (
      resolvedTitle,
      resolvedArtist,
      hints = {},
      options = {}
    ) => {
      const allowLyrics =
        options.allowLyrics !== false &&
        (!isRemoteTrackPath(filePath) || isStreamingTrackPath(filePath))
      const allowMv = options.allowMv !== false
      const nextHints = {
        ...hints,
        mvRequestSeq: requestSeq,
        preserveExisting: true,
        allowMvSearch: allowMv && mvLoadSurfaceActiveRef.current
      }
      rememberDeferredLyricsMvLoad(resolvedTitle, resolvedArtist, nextHints, {
        allowLyrics,
        allowMv
      })
      if (!allowLyrics || !lyricsLoadSurfaceActiveRef.current) return false
      fetchLyrics(filePath, resolvedTitle, resolvedArtist, nextHints)
      return true
    }

    const shouldRefreshCachedOggOpusCover = (entry) =>
      /\.(opus|ogg)$/i.test(filePath) &&
      entry?.coverChecked &&
      typeof entry?.cover === 'string' &&
      entry.coverExtractorVersion !== 2
    const hasCurrentEmbeddedLyricsExtraction = (entry) =>
      entry?.lyricsExtractorVersion === EMBEDDED_LYRICS_EXTRACTOR_VERSION

    const isCompleteCachedMeta = (entry) =>
      !!(
        entry?.coverChecked &&
        entry?.bpmChecked &&
        entry?.bpmDetectorVersion === BPM_DETECTOR_VERSION &&
        entry?.mqaChecked &&
        hasCurrentEmbeddedLyricsExtraction(entry) &&
        !shouldRefreshCachedOggOpusCover(entry) &&
        !shouldRefreshTrackMetaCacheForAudioQuality(filePath, entry) &&
        entry.coverMemoryTrimmed !== true
      )

    const startEarlyLyricsLoad = (entry = {}) => {
      if (isRemoteTrackPath(filePath) && !isStreamingTrackPath(filePath)) return false
      const { resolvedTitle, resolvedArtist } = getFallbackMetadata({
        ...trackHints,
        ...(entry || {})
      })
      if (!resolvedTitle) return false

      loadLyricsForCurrentSurface(resolvedTitle, resolvedArtist, {
        album: entry.album || trackHints.album || '',
        embeddedLyrics: entry.lyrics || trackHints.embeddedLyrics || '',
        hasLyrics: trackHints.hasLyrics === true,
        mvOriginUrl: mvOriginUrlHint,
        sourceUrl: sourceUrlHint
      })
      return true
    }

    const applyCachedMeta = (entry, { loadLyrics = true } = {}) => {
      const { resolvedTitle, resolvedArtist } = getFallbackMetadata(entry)

      setMetadata({
        title: resolvedTitle,
        artist: resolvedArtist,
        album: entry.album || '',
        albumArtist: entry.albumArtist || '',
        trackNo: entry.trackNo ?? null,
        discNo: entry.discNo ?? null
      })
      setTechnicalInfo((prev) => ({
        ...prev,
        sampleRate: entry.sampleRateHz || null,
        bitrate: entry.bitrateKbps ? entry.bitrateKbps * 1000 : null,
        channels: entry.channels || null,
        bitDepth: entry.bitDepth || null,
        isMqa: entry.isMqa === true,
        codec: entry.codec || null,
        originalBpm: entry.bpmMeasured ? entry.bpm || null : null
      }))
      setBpmDetectionState(entry.bpmMeasured ? 'done' : entry.bpmChecked ? 'failed' : 'idle')
      if (typeof entry.duration === 'number' && entry.duration > 0) {
        setDuration(entry.duration)
      }
      if (entry.cover) {
        setCoverUrl(entry.cover)
      } else {
        setCoverUrl(null)
        fetchCloudCover(resolvedTitle, resolvedArtist, requestSeq, {
          album: entry.album || ''
        })
      }
      if (loadLyrics) {
        loadLyricsForCurrentSurface(resolvedTitle, resolvedArtist, {
          album: entry.album || '',
          embeddedLyrics: entry.lyrics || '',
          hasLyrics: trackHints.hasLyrics === true,
          mvOriginUrl: mvOriginUrlHint,
          sourceUrl: sourceUrlHint
        })
      }
      return { resolvedTitle, resolvedArtist }
    }

    const memoryMeta = trackMetaMapRef.current?.[filePath]
    if (isCompleteCachedMeta(memoryMeta)) {
      applyCachedMeta(memoryMeta, { loadLyrics: !isRemoteTrackPath(filePath) || isStreamingTrackPath(filePath) })
      return
    }
    startEarlyLyricsLoad(hasCurrentEmbeddedLyricsExtraction(memoryMeta) ? memoryMeta : trackHints)

    if (isRemoteTrackPath(filePath)) {
      const isStreamingRemoteTrack = isStreamingTrackPath(filePath)
      const playlistTrack = playlistRef.current.find((track) => track.path === filePath)
      const builtRemoteMeta = buildRemoteTrackMeta(playlistTrack || { path: filePath, info: trackHints })
      const remoteMeta = mergeRemoteTrackMeta(memoryMeta, builtRemoteMeta)
      if (!isStreamingRemoteTrack) {
        setLyricsMatchStatus('none')
        setLyricsSourceStatus({ kind: 'none', detail: '', origin: 'remote' })
      }
      const { resolvedTitle, resolvedArtist } = applyCachedMeta(remoteMeta, { loadLyrics: false })
      const remoteMvHints = {
        album: remoteMeta.album || '',
        mvOriginUrl: mvOriginUrlHint,
        sourceUrl: sourceUrlHint,
        streamingTrack: playlistTrack || null
      }
      loadLyricsForCurrentSurface(resolvedTitle, resolvedArtist, remoteMvHints, {
        allowLyrics: isStreamingRemoteTrack,
        allowMv: false
      })
      if (mvLoadSurfaceActiveRef.current) {
        searchAndApplyMvForTrack({
          filePath,
          title: resolvedTitle,
          artist: resolvedArtist,
          hints: remoteMvHints,
          requestSeq
        })
      }
      writeTrackMetaCache({ [filePath]: remoteMeta })
      return
    }

    setCoverUrl(null)
    setMetadata({
      title: '',
      artist: '',
      album: '',
      albumArtist: '',
      trackNo: null,
      discNo: null
    })
    setTechnicalInfo({
      sampleRate: null,
      originalBpm: null,
      channels: null,
      bitrate: null,
      bitDepth: null,
      isMqa: false,
      codec: null
    })
    setBpmDetectionState('idle')

    const detectMeasuredBpm = async (baseMeta = {}) => {
      const hasCurrentBpmVersion = baseMeta?.bpmDetectorVersion === BPM_DETECTOR_VERSION
      if (hasCurrentBpmVersion && baseMeta?.bpmMeasured && Number(baseMeta.bpm) > 0) {
        setBpmDetectionState('done')
        return
      }
      if (hasCurrentBpmVersion && baseMeta?.bpmChecked) {
        setBpmDetectionState('failed')
        return
      }
      if (!window.api?.detectBpmHandler) {
        setBpmDetectionState('unavailable')
        return
      }
      const mergeBpmEntryWithLatestMeta = (entry = {}) =>
        mergeTrackMetaEntryPreservingCover(trackMetaMapRef.current?.[filePath] || {}, entry)

      try {
        await new Promise((resolve) => setTimeout(resolve, BPM_DETECTION_START_DELAY_MS))
        if (trackLoadSeqRef.current !== requestSeq) return
        setBpmDetectionState('detecting')
        const result = await window.api.detectBpmHandler(filePath)
        if (trackLoadSeqRef.current !== requestSeq) return
        const bpm = Number(result?.bpm)
        if (!result?.success || !Number.isFinite(bpm) || bpm <= 0) {
          setBpmDetectionState('failed')
          const failedBpmEntry = mergeBpmEntryWithLatestMeta({
            ...baseMeta,
            bpm: null,
            bpmChecked: true,
            bpmMeasured: false,
            bpmDetectorVersion: BPM_DETECTOR_VERSION,
            bpmBackend: result?.backend || null
          })
          setTrackMetaMap((prev) => {
            const mergedEntry = mergeTrackMetaEntryPreservingCover(
              prev[filePath] || {},
              failedBpmEntry
            )
            return {
              ...prev,
              [filePath]: mergedEntry
            }
          })
          writeTrackMetaCache({ [filePath]: failedBpmEntry })
          return
        }

        const measuredBpm = Math.round(bpm)
        const measuredEntry = mergeBpmEntryWithLatestMeta({
          ...baseMeta,
          bpm: measuredBpm,
          bpmChecked: true,
          bpmMeasured: true,
          bpmDetectorVersion: BPM_DETECTOR_VERSION,
          bpmBackend: result?.backend || null,
          bpmConfidence: Number(result?.confidence) || 0
        })

        setTechnicalInfo((prev) => ({
          ...prev,
          originalBpm: measuredBpm
        }))
        setBpmDetectionState('done')
        setTrackMetaMap((prev) => {
          const mergedEntry = mergeTrackMetaEntryPreservingCover(
            prev[filePath] || {},
            measuredEntry
          )
          return {
            ...prev,
            [filePath]: mergedEntry
          }
        })
        writeTrackMetaCache({ [filePath]: measuredEntry })
      } catch {
        setBpmDetectionState('failed')
        /* BPM detection is best-effort. */
      }
    }

    try {
      const cachedMeta = (await readTrackMetaCache([filePath]))[filePath]
      if (trackLoadSeqRef.current !== requestSeq) return

      if (isCompleteCachedMeta(cachedMeta)) {
        applyCachedMeta(cachedMeta)
        detectMeasuredBpm(cachedMeta)
      } else {
        // 1. Get Extended Metadata from Main Process (Music-Metadata)
        const data = await window.api.getExtendedMetadataHandler(filePath)
        if (trackLoadSeqRef.current !== requestSeq) return

        if (data.success) {
          const { technical, common } = data
          const resolvedIdentity = resolveTrackIdentityFromMetadata({
            fileName: filePath.split(/[\\/]/).pop() || '',
            title: common.title || cachedMeta?.title || '',
            artist: common.artist || cachedMeta?.artist || '',
            albumArtist: common.albumArtist || cachedMeta?.albumArtist || ''
          })
          const resolvedTitle = resolvedIdentity.title || common.title || cachedMeta?.title
          const resolvedArtist = resolvedIdentity.artist || 'Unknown Artist'
          const resolvedAlbum = common.album || cachedMeta?.album || ''
          const resolvedAlbumArtist = common.albumArtist || cachedMeta?.albumArtist || ''
          const resolvedCover = common.cover || cachedMeta?.cover || null
          const resolvedLyrics = common.lyrics || cachedMeta?.lyrics || null
          const existingBpmEntry = trackMetaMapRef.current?.[filePath] || cachedMeta || {}
          const existingMeasuredBpm =
            existingBpmEntry?.bpmDetectorVersion === BPM_DETECTOR_VERSION &&
            existingBpmEntry?.bpmMeasured === true &&
            Number(existingBpmEntry?.bpm) > 0

          setMetadata({
            title: resolvedTitle,
            artist: resolvedArtist,
            album: resolvedAlbum,
            albumArtist: resolvedAlbumArtist,
            trackNo: common.trackNo ?? null,
            discNo: common.discNo ?? null
          })
          setTechnicalInfo((prev) => ({
            ...prev,
            sampleRate: technical.sampleRate,
            bitrate: technical.bitrate,
            channels: technical.channels,
            bitDepth: technical.bitDepth,
            isMqa: technical.isMqa === true,
            codec: technical.codec,
            originalBpm: existingMeasuredBpm ? Number(existingBpmEntry?.bpm) : prev.originalBpm
          }))

          // DSD / native HiFi: <audio> duration is unreliable (browser does not decode DSD correctly).
          if (
            typeof technical.duration === 'number' &&
            technical.duration > 0 &&
            (useNativeEngineRef.current || /\.(dsf|dff)$/i.test(filePath))
          ) {
            setDuration(technical.duration)
          }

          if (resolvedCover) {
            setCoverUrl(resolvedCover)
          } else {
            fetchCloudCover(resolvedTitle, resolvedArtist, requestSeq, { album: resolvedAlbum })
          }

          loadLyricsForCurrentSurface(resolvedTitle, resolvedArtist, {
            album: resolvedAlbum,
            embeddedLyrics: resolvedLyrics || '',
            hasLyrics: trackHints.hasLyrics === true,
            mvOriginUrl: mvOriginUrlHint,
            sourceUrl: sourceUrlHint
          })
          const parsedMetaEntry = {
            title: resolvedTitle || null,
            artist: resolvedArtist || null,
            album: resolvedAlbum || null,
            albumArtist: resolvedAlbumArtist || null,
            trackNo: common.trackNo ?? null,
            discNo: common.discNo ?? null,
            cover: resolvedCover,
            coverExtractorVersion: common.coverExtractorVersion ?? null,
            lyricsExtractorVersion:
              common.lyricsExtractorVersion ?? EMBEDDED_LYRICS_EXTRACTOR_VERSION,
            duration: technical.duration || null,
            coverChecked: true,
            bpmChecked: true,
            bpmMeasured: existingMeasuredBpm,
            mqaChecked: true,
            codec: technical.codec || null,
            bitrateKbps: technical.bitrate ? Math.round(technical.bitrate / 1000) : null,
            sampleRateHz: technical.sampleRate || null,
            bitDepth: technical.bitDepth || null,
            channels: technical.channels || null,
            isMqa: technical.isMqa === true,
            bpmDetectorVersion: existingMeasuredBpm ? BPM_DETECTOR_VERSION : null,
            bpmBackend: existingMeasuredBpm ? existingBpmEntry?.bpmBackend || null : null,
            bpmConfidence: existingMeasuredBpm ? Number(existingBpmEntry?.bpmConfidence) || 0 : 0,
            bpm: existingMeasuredBpm ? Number(existingBpmEntry?.bpm) : null,
            lyrics: resolvedLyrics
          }
          writeTrackMetaCache({ [filePath]: parsedMetaEntry })
          detectMeasuredBpm(parsedMetaEntry)
        } else {
          // Fallback for failed extraction
          const title = filePath
            .split('\\')
            .pop()
            .split('/')
            .pop()
            .replace(/\.[^/.]+$/, '')
          const fallbackFromTitle = parseArtistTitleFromName(title || '')
          const resolvedTitle = fallbackFromTitle?.title || title
          const resolvedArtist = fallbackFromTitle?.artist || 'Unknown Artist'

          setMetadata({
            title: resolvedTitle,
            artist: resolvedArtist,
            album: '',
            albumArtist: '',
            trackNo: null,
            discNo: null
          })
          fetchCloudCover(resolvedTitle, resolvedArtist, requestSeq)
          loadLyricsForCurrentSurface(resolvedTitle, resolvedArtist, {
            hasLyrics: trackHints.hasLyrics === true,
            mvOriginUrl: mvOriginUrlHint,
            sourceUrl: sourceUrlHint
          })
        }
      }
    } catch (e) {
      console.error('Track data extraction error:', e)
    }
  }

  useEffect(() => {
    if (!lyricsLoadSurfaceActive && !mvLoadSurfaceActive) return

    const activeTrack = playlistRef.current[currentIndexRef.current]
    if (!activeTrack?.path) return

    const filePath = activeTrack.path
    const deferred =
      lyricsMvDeferredLoadRef.current?.filePath === filePath
        ? lyricsMvDeferredLoadRef.current
        : null
    const storedMeta = trackMetaMapRef.current?.[filePath] || {}
    const parsedInfo = parseTrackInfo(activeTrack, storedMeta)
    const title =
      deferred?.title ||
      metadata.title ||
      parsedInfo?.title ||
      stripExtension(activeTrack.name || '')
    const artist =
      deferred?.artist ||
      metadata.artist ||
      (parsedInfo?.artist && parsedInfo.artist !== 'Unknown Artist' ? parsedInfo.artist : '') ||
      activeTrack.info?.artist ||
      ''
    if (!title) return

    const requestSeq = Number.isFinite(Number(deferred?.requestSeq))
      ? Number(deferred.requestSeq)
      : trackLoadSeqRef.current
    const hints = {
      album:
        metadata.album ||
        parsedInfo?.album ||
        activeTrack.info?.album ||
        storedMeta.album ||
        deferred?.hints?.album ||
        '',
      embeddedLyrics:
        storedMeta.lyrics ||
        activeTrack.info?.lyrics ||
        activeTrack.lyrics ||
        deferred?.hints?.embeddedLyrics ||
        '',
      hasLyrics: activeTrack.hasLyrics === true,
      mvOriginUrl: activeTrack.mvOriginUrl || activeTrack.sourceUrl || deferred?.hints?.mvOriginUrl,
      sourceUrl: activeTrack.sourceUrl || activeTrack.mvOriginUrl || deferred?.hints?.sourceUrl,
      ...(deferred?.hints || {})
    }
    const loadKey = [
      filePath,
      requestSeq,
      lyricsLoadSurfaceActive ? 'lyrics' : '',
      mvLoadSurfaceActive ? 'mv' : '',
      config.lyricsSource,
      config.localLyricsPriority
    ].join('::')
    if (lyricsMvSurfaceLoadKeyRef.current === loadKey) return
    lyricsMvSurfaceLoadKeyRef.current = loadKey

    if (lyricsLoadSurfaceActive && (!isRemoteTrackPath(filePath) || isStreamingTrackPath(filePath))) {
      fetchLyrics(filePath, title, artist, {
        ...hints,
        mvRequestSeq: requestSeq,
        preserveExisting: true,
        allowMvSearch: mvLoadSurfaceActive
      }).catch((e) => console.error('Deferred lyrics/MV load error', e))
      return
    }

    if (mvLoadSurfaceActive) {
      searchAndApplyMvForTrack({
        filePath,
        title,
        artist,
        hints,
        requestSeq
      })
    }
  }, [
    lyricsLoadSurfaceActive,
    mvLoadSurfaceActive,
    currentTrackPath,
    metadata.title,
    metadata.artist,
    metadata.album,
    config.lyricsSource,
    config.localLyricsPriority,
    searchAndApplyMvForTrack
  ])

  const openMetadataEditorForTrack = useCallback((track) => {
    if (!track?.path) return
    setMetadataEditorTrack(track)
    setMetadataEditorOpen(true)
  }, [])

  const buildEditableMetadataDraft = useCallback(
    (track) => {
      if (!track?.path) return null
      const stored = {
        ...(trackMetaMapRef.current?.[track.path] || {}),
        ...(displayMetadataOverridesRef.current?.[track.path] || {})
      }
      const parsed = parseTrackInfo(track, stored)
      const isActiveTrack = playlistRef.current[currentIndexRef.current]?.path === track.path
      return {
        path: track.path,
        title: isActiveTrack
          ? metadata.title || parsed.title || ''
          : stored.title || parsed.title || '',
        artist: isActiveTrack
          ? metadata.artist || parsed.artist || ''
          : stored.artist || parsed.artist || '',
        album: isActiveTrack
          ? metadata.album || parsed.album || ''
          : stored.album || parsed.album || '',
        albumArtist: isActiveTrack
          ? metadata.albumArtist || stored.albumArtist || ''
          : stored.albumArtist || '',
        trackNo: isActiveTrack
          ? (metadata.trackNo ?? stored.trackNo ?? null)
          : (stored.trackNo ?? null),
        discNo: isActiveTrack ? (metadata.discNo ?? stored.discNo ?? null) : (stored.discNo ?? null)
      }
    },
    [metadata]
  )

  const handleSaveTrackMetadata = useCallback(
    async (draft) => {
      if (!draft?.path || !window.api?.writeTags) return

      const activeTrack = playlistRef.current[currentIndexRef.current] || null
      const isEditingActiveTrack = activeTrack?.path === draft.path
      const wasPlayingBeforeSave = isEditingActiveTrack ? !!isPlaying : false
      const savedPlaybackTime = isEditingActiveTrack
        ? Math.max(
            0,
            Number(
              useNativeEngineRef.current
                ? currentTimeRef.current
                : (audioRef.current?.currentTime ?? currentTimeRef.current)
            ) || 0
          )
        : 0

      if (isEditingActiveTrack) {
        try {
          if (useNativeEngineRef.current && window.api?.stopAudio) {
            await window.api.stopAudio()
          }
        } catch {
          /* best effort release */
        }

        try {
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.removeAttribute('src')
            audioRef.current.src = ''
            audioRef.current.load()
          }
        } catch {
          /* best effort release */
        }

        await wait(120)
      }

      const response = await window.api.writeTags(
        draft.path,
        {
          title: draft.title,
          artist: draft.artist,
          albumArtist: draft.albumArtist,
          album: draft.album,
          trackNumber: draft.trackNo,
          year: draft.year,
          genre: draft.genre
        },
        draft.coverPath || null
      )
      if (!response?.ok) {
        throw new Error(response?.error || t('metadataEditor.saveFailed', 'Failed to save tags'))
      }

      const title = String(draft.title || '').trim()
      const artist = String(draft.artist || '').trim()
      const album = String(draft.album || '').trim()
      const albumArtist = String(draft.albumArtist || '').trim()
      const genre = String(draft.genre || '').trim()
      const trackNo = Number.parseInt(String(draft.trackNo || ''), 10)
      const year = Number.parseInt(String(draft.year || ''), 10)
      const nextMetaEntry = {
        title: title || null,
        artist: artist || null,
        album: album || null,
        albumArtist: albumArtist || null,
        trackNo: Number.isFinite(trackNo) && trackNo > 0 ? trackNo : null,
        year: Number.isFinite(year) && year > 0 ? year : null,
        genre: genre || null,
        cover: draft.cover || null,
        coverChecked: true
      }

      setTrackMetaMap((prev) => ({
        ...prev,
        [draft.path]: nextMetaEntry
      }))
      writeTrackMetaCache({ [draft.path]: nextMetaEntry })

      setPlaylist((prev) =>
        prev.map((item) =>
          item?.path === draft.path
            ? {
                ...item,
                info: {
                  ...(item.info || {}),
                  ...(title ? { title } : {}),
                  ...(artist ? { artist } : {}),
                  ...(album ? { album } : {})
                }
              }
            : item
        )
      )

      if (activeTrack?.path === draft.path) {
        setMetadata({
          title,
          artist,
          album,
          albumArtist,
          trackNo: Number.isFinite(trackNo) && trackNo > 0 ? trackNo : null,
          discNo: null
        })
        if (draft.cover) {
          setCoverUrlTrackPath(draft.path)
          setCoverUrl(draft.cover)
        }

        try {
          if (audioRef.current) {
            audioRef.current.src = localPathToAudioSrc(draft.path)
            audioRef.current.load()
            applyStartTimeToAudio(audioRef.current, savedPlaybackTime)
          }

          if (useNativeEngineRef.current && window.api?.playAudio) {
            if (wasPlayingBeforeSave) {
              audioRef.current?.play?.().catch(() => {})
              await window.api.playAudio(draft.path, savedPlaybackTime, playbackRateRef.current)
            } else {
              await window.api.pauseAudio?.().catch(() => {})
            }
          } else if (audioRef.current && wasPlayingBeforeSave) {
            await audioRef.current.play().catch(() => {})
          }
        } catch (restoreError) {
          console.error('Failed to restore playback after tag save:', restoreError)
        }

        setCurrentTime(savedPlaybackTime)
        setIsPlaying(wasPlayingBeforeSave)
        await loadTrackData(draft.path, {
          title:
            activeTrack?.info?.title ||
            activeTrack?.title ||
            stripExtension(activeTrack?.name || ''),
          artist: activeTrack?.info?.artist || activeTrack?.artist || '',
          album: activeTrack?.info?.album || '',
          embeddedLyrics: activeTrack?.info?.lyrics || activeTrack?.lyrics || '',
          mvOriginUrl: activeTrack?.mvOriginUrl || activeTrack?.sourceUrl,
          sourceUrl: activeTrack?.sourceUrl || activeTrack?.mvOriginUrl,
          hasLyrics: activeTrack?.hasLyrics === true
        })
      }
    },
    [applyStartTimeToAudio, isPlaying, loadTrackData]
  )

  const openQuickMetadataFieldEditor = useCallback(
    (field) => {
      const activeTrack = playlistRef.current[currentIndexRef.current] || null
      if (!activeTrack?.path || !isLocalAudioFilePath(activeTrack.path)) return
      const draft = buildEditableMetadataDraft(activeTrack)
      if (!draft) return
      setQuickEditField(field)
      setQuickEditDraft(String(draft[field] ?? ''))
    },
    [buildEditableMetadataDraft]
  )

  const handleQuickFieldTrigger = useCallback(
    (field, event) => {
      if (!(event?.ctrlKey || event?.metaKey)) return
      event.preventDefault()
      event.stopPropagation()
      openQuickMetadataFieldEditor(field)
    },
    [openQuickMetadataFieldEditor]
  )

  const commitQuickMetadataFieldEdit = useCallback(async () => {
    if (!quickEditField || quickEditBusy) return
    const activeTrack = playlistRef.current[currentIndexRef.current] || null
    if (!activeTrack?.path || !isLocalAudioFilePath(activeTrack.path)) {
      setQuickEditField(null)
      setQuickEditDraft('')
      return
    }

    const nextDraft = buildEditableMetadataDraft(activeTrack)
    if (!nextDraft) return
    const nextValue = String(quickEditDraft || '').trim()

    setQuickEditBusy(true)
    try {
      setDisplayMetadataOverrides((prev) => {
        const current = { ...(prev?.[activeTrack.path] || {}) }
        if (nextValue) current[quickEditField] = nextValue
        else delete current[quickEditField]
        const next = { ...(prev || {}) }
        if (Object.keys(current).length > 0) next[activeTrack.path] = current
        else delete next[activeTrack.path]
        return next
      })
      if (playlistRef.current[currentIndexRef.current]?.path === activeTrack.path) {
        setMetadata((prev) => ({
          ...prev,
          [quickEditField]: nextValue
        }))
      }
      setQuickEditField(null)
      setQuickEditDraft('')
    } catch (error) {
      alert(error?.message || String(error))
    } finally {
      setQuickEditBusy(false)
    }
  }, [buildEditableMetadataDraft, quickEditBusy, quickEditDraft, quickEditField])

  const cancelQuickMetadataFieldEdit = useCallback(() => {
    if (quickEditBusy) return
    setQuickEditField(null)
    setQuickEditDraft('')
  }, [quickEditBusy])

  const handleQuickCoverPick = useCallback(async (event) => {
    if (!(event?.ctrlKey || event?.metaKey)) return
    const activeTrack = playlistRef.current[currentIndexRef.current] || null
    if (!activeTrack?.path || !isLocalAudioFilePath(activeTrack.path)) return

    event.preventDefault()
    event.stopPropagation()

    const coverPath = await window.api?.openImageHandler?.(configRef.current.uiLocale)
    if (!coverPath) return

    const coverHref = window.api?.pathToFileURL?.(coverPath) || coverPath

    setQuickEditBusy(true)
    try {
      setDisplayMetadataOverrides((prev) => {
        const current = { ...(prev?.[activeTrack.path] || {}) }
        current.coverPath = coverPath
        current.cover = coverHref
        return {
          ...(prev || {}),
          [activeTrack.path]: current
        }
      })
    } catch (error) {
      alert(error?.message || String(error))
    } finally {
      setQuickEditBusy(false)
    }
  }, [])

  const openBatchRenameDrawer = useCallback(() => {
    setBatchRenameOpen(true)
  }, [])

  const handleApplyBatchRename = useCallback(
    async (items) => {
      if (!window.api?.batchRenameFilesHandler) return
      const response = await window.api.batchRenameFilesHandler(items)
      if (!response?.success) {
        throw new Error(response?.error || t('batchRename.failed', 'Failed to rename files'))
      }
      if (Array.isArray(response.renamed) && response.renamed.length > 0) {
        applyLibraryFolderDelta({ renamed: response.renamed, removedPaths: [], added: [] })
      }
    },
    [applyLibraryFolderDelta, t]
  )

  const fetchCloudCover = async (
    title,
    artist,
    requestSeq = trackLoadSeqRef.current,
    options = {}
  ) => {
    const cleanTitle = String(title || '').trim()
    const cleanArtist = String(artist || '').trim()
    const rawAlbum = String(options.album || '').trim()
    const cleanAlbum = /^unknown album$/i.test(rawAlbum) ? '' : rawAlbum
    const excludedUrl = String(options.excludeUrl || '').trim()
    if (!cleanTitle && !cleanAlbum) return
    const coverSeq = ++cloudCoverFetchSeqRef.current

    const applyResolvedCover = (url) => {
      const resolvedUrl = String(url || '').trim()
      if (!resolvedUrl || resolvedUrl === excludedUrl) return false
      if (trackLoadSeqRef.current !== requestSeq || cloudCoverFetchSeqRef.current !== coverSeq) {
        return true
      }
      setFailedDisplayCoverUrl(null)
      setCoverUrl(resolvedUrl)
      return true
    }

    if (window.api?.neteaseSearch && cleanTitle) {
      try {
        const songs = await window.api.neteaseSearch(`${cleanTitle} ${cleanArtist}`.trim())
        if (trackLoadSeqRef.current !== requestSeq || cloudCoverFetchSeqRef.current !== coverSeq)
          return
        const bestSong = pickBestCoverCandidate(songs, cleanTitle, cleanArtist, cleanAlbum)
        if (applyResolvedCover(normalizeNeteaseCoverUrl(bestSong?.cover))) return
      } catch (e) {
        console.warn('Netease cover fetch error:', e)
      }
    }

    if (window.api?.neteaseSearchAlbum && cleanAlbum) {
      try {
        const albums = await window.api.neteaseSearchAlbum({
          albumName: cleanAlbum,
          artist: cleanArtist
        })
        if (trackLoadSeqRef.current !== requestSeq || cloudCoverFetchSeqRef.current !== coverSeq)
          return
        const bestAlbum = pickBestAlbumCoverCandidate(albums, cleanAlbum, cleanArtist)
        if (applyResolvedCover(normalizeNeteaseCoverUrl(bestAlbum?.picUrl))) return
      } catch (e) {
        console.warn('Netease album cover fetch error:', e)
      }
    }

    if (!cleanTitle) return
    try {
      const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim())
      const response = await fetch(
        `https://itunes.apple.com/search?term=${query}&entity=song&limit=1`
      )
      if (trackLoadSeqRef.current !== requestSeq || cloudCoverFetchSeqRef.current !== coverSeq)
        return
      const data = await response.json()
      if (data && data.results && data.results.length > 0) {
        const artwork = data.results[0].artworkUrl100
        applyResolvedCover(normalizeItunesCoverUrl(artwork))
      }
    } catch (e) {
      console.error('Cloud cover fetch error:', e)
    }
  }

  const fetchCloudAlbumCover = async (album, artist) => {
    const cleanAlbum = String(album || '').trim()
    const cleanArtist = String(artist || '').trim()
    if (!cleanAlbum || /^unknown album$/i.test(cleanAlbum)) return null

    if (window.api?.neteaseSearchAlbum) {
      try {
        const albums = await window.api.neteaseSearchAlbum({
          albumName: cleanAlbum,
          artist: cleanArtist
        })
        const bestAlbum = pickBestAlbumCoverCandidate(albums, cleanAlbum, cleanArtist)
        const cover = normalizeNeteaseCoverUrl(bestAlbum?.picUrl || bestAlbum?.cover)
        if (cover) return cover
      } catch (e) {
        console.warn('Netease album cover prefetch error:', e)
      }
    }

    try {
      const query = encodeURIComponent(`${cleanAlbum} ${cleanArtist}`.trim())
      const response = await fetch(
        `https://itunes.apple.com/search?term=${query}&entity=album&limit=5`
      )
      const data = await response.json()
      const bestAlbum = pickBestAlbumCoverCandidate(data?.results || [], cleanAlbum, cleanArtist)
      return normalizeItunesCoverUrl(bestAlbum?.artworkUrl100) || null
    } catch (e) {
      console.warn('iTunes album cover prefetch error:', e)
      return null
    }
  }

  /** @returns {Promise<string[]>} Paths to reference (new or already in library), for user playlists etc. */
  const processFiles = async (files) => {
    setIsConverting(true)
    const processed = []
    const existingPaths = new Set(playlist.map((p) => p.path))
    const pathsForPlaylist = []

    for (const file of files) {
      if (existingPaths.has(file.path)) {
        pathsForPlaylist.push(file.path)
        continue
      }

      if (file.path.toLowerCase().endsWith('.ncm')) {
        setConversionMsg(t('settings.decrypting', { name: file.name }))
        const result = await window.api.convertNcmHandler(file.path)
        if (result.success) {
          const item = { name: result.name, path: result.path }
          processed.push(item)
          existingPaths.add(result.path)
          pathsForPlaylist.push(result.path)
        } else {
          console.error('Failed to convert:', file.path, result.error)
        }
      } else {
        processed.push(file)
        existingPaths.add(file.path)
        pathsForPlaylist.push(file.path)
      }
    }

    if (processed.length > 0) {
      setPlaylist((prev) => {
        const next = [...prev, ...processed]
        playlistRef.current = next
        persistStateImmediately(
          'playlist',
          'nc_playlist',
          next,
          configRef.current.autoSaveLibrary !== false && playlistStoreHydratedRef.current
        )
        return next
      })
      if (currentIndex === -1) setCurrentIndex(0)
    }
    setIsConverting(false)
    setConversionMsg('')
    return [...new Set(pathsForPlaylist)]
  }

  const handleImport = async () => {
    const folders = await window.api.openDirectoryHandler()
    if (folders && folders.length > 0) {
      const folderPath = folders[0]
      const audioFiles = await window.api.readDirectoryHandler(folderPath)
      if (audioFiles.length > 0) {
        await processFiles(audioFiles)
      }
      // Save folder path for auto-rescan
      setImportedFolders((prev) => {
        const normalized = normalizeImportedFolderPath(folderPath)
        if (prev.some((f) => f.toLowerCase() === normalized.toLowerCase())) return prev
        const next = [...prev, normalized]
        persistStateImmediately(
          'importedFolders',
          'nc_imported_folders',
          next,
          importedFoldersHydratedRef.current
        )
        return next
      })
    }
  }

  const handleImportFile = async () => {
    const files = await window.api.openFileHandler(configRef.current.uiLocale)
    if (files && files.length > 0) {
      await processFiles(files)
    }
  }

  const importM3UPlaylistFromText = useCallback(
    async (content, filePath) => {
      const paths = parseM3UPlaylist(content, filePath)
      if (paths.length === 0) {
        alert(t('playlists.noPlaylistsInFile'))
        return false
      }

      const audioFiles = await window.api.getAudioFilesFromPaths(paths)
      if (audioFiles && audioFiles.length > 0) {
        await processFiles(audioFiles)
      }

      const name = getPathBasename(filePath).replace(/\.(m3u8?|txt)$/i, '') || 'M3U Playlist'
      const importedPlaylist = {
        id: crypto.randomUUID(),
        name,
        paths
      }
      setUserPlaylists((prev) => [...prev, importedPlaylist])
      setSelectedSmartCollectionId(null)
      setSelectedUserPlaylistId(importedPlaylist.id)
      setListMode('playlists')
      return true
    },
    [processFiles, t]
  )

  const importSharedPlaylistsFromPayload = useCallback(
    async (sharedPlaylists) => {
      if (!Array.isArray(sharedPlaylists) || sharedPlaylists.length === 0) return false
      if (!window.api?.playlistShare?.importPlaylists) return false

      const playlistSaveDir = (
        configRef.current.playlistImportFolder ||
        configRef.current.downloadFolder ||
        ''
      ).trim()
      if (!playlistSaveDir) {
        alert(t('downloader.folderRequired'))
        return false
      }

      setIsConverting(true)
      setConversionMsg(t('downloader.connecting'))

      const createdPlaylistIds = new Map()
      const streamedPathSet = new Set()
      const ensureImportedPlaylistTarget = (playlistName) => {
        const normalizedName = String(playlistName || 'Imported').trim() || 'Imported'
        if (createdPlaylistIds.has(normalizedName)) {
          return createdPlaylistIds.get(normalizedName)
        }
        const newId = crypto.randomUUID()
        createdPlaylistIds.set(normalizedName, newId)
        setUserPlaylists((prev) => [...prev, { id: newId, name: normalizedName, paths: [] }])
        setSelectedSmartCollectionId(null)
        setSelectedUserPlaylistId(newId)
        return newId
      }
      const appendImportedTracks = (playlistName, items) => {
        const normalizedItems = (items || []).filter((item) => item?.path)
        if (normalizedItems.length === 0) return
        const targetId = ensureImportedPlaylistTarget(playlistName)
        const trackItems = normalizedItems.map((item) => ({
          name: item.name || item.path.split(/[/\\]/).pop() || 'track',
          path: item.path,
          type: 'local',
          ...(item.sourceUrl ? { sourceUrl: item.sourceUrl, mvOriginUrl: item.sourceUrl } : {})
        }))
        setPlaylist((prev) => {
          const seen = new Set(prev.map((track) => track.path))
          const next = [...prev]
          for (const track of trackItems) {
            if (!seen.has(track.path)) {
              seen.add(track.path)
              next.push(track)
            }
          }
          return next
        })
        const importedPaths = trackItems.map((track) => track.path)
        setUserPlaylists((prev) =>
          prev.map((playlistItem) =>
            playlistItem.id === targetId
              ? {
                  ...playlistItem,
                  paths: [...new Set([...(playlistItem.paths || []), ...importedPaths])]
                }
              : playlistItem
          )
        )
      }

      const unsub = window.api.playlistShare.onImportProgress((payload) => {
        if (payload?.phase === 'meta') {
          ensureImportedPlaylistTarget(payload.playlistName || 'Imported')
          setConversionMsg(
            t('downloader.linkMetaLine', {
              name: payload.playlistName || 'Imported',
              total: payload.total ?? 0
            })
          )
          return
        }
        if (payload?.phase === 'download') {
          setConversionMsg(
            t('downloader.downloadProgress', {
              current: payload.current ?? 0,
              total: payload.total ?? 0,
              track: payload.trackName || ''
            })
          )
          return
        }
        if (payload?.phase === 'added' && payload.path) {
          streamedPathSet.add(payload.path)
          appendImportedTracks(payload.playlistName || 'Imported', [
            {
              name: payload.trackTitle || payload.path.split(/[/\\]/).pop() || 'track',
              path: payload.path,
              sourceUrl: payload.sourceUrl || ''
            }
          ])
        }
      })

      try {
        const result = await window.api.playlistShare.importPlaylists({
          playlists: sharedPlaylists,
          downloadFolder: playlistSaveDir
        })
        const importedPlaylists = Array.isArray(result?.playlists) ? result.playlists : []
        let okCount = 0
        let failCount = 0
        let firstFailure = null

        for (const playlistItem of importedPlaylists) {
          const addedItems = Array.isArray(playlistItem?.added) ? playlistItem.added : []
          const failedItems = Array.isArray(playlistItem?.failed) ? playlistItem.failed : []
          okCount += addedItems.length
          failCount += failedItems.length
          if (!firstFailure && failedItems.length > 0) firstFailure = failedItems[0]

          const pendingItems = addedItems
            .filter((item) => item?.path && !streamedPathSet.has(item.path))
            .map((item) => ({
              name: item.trackTitle || item.path.split(/[/\\]/).pop() || 'track',
              path: item.path,
              sourceUrl: item.sourceUrl || ''
            }))

          if (pendingItems.length > 0) {
            appendImportedTracks(playlistItem.playlistName || 'Imported', pendingItems)
          }
        }

        if (failCount > 0 && firstFailure) {
          alert(
            t('downloader.importPartial', {
              ok: okCount,
              fail: failCount,
              name: firstFailure.name,
              error: firstFailure.error
            })
          )
        } else if (okCount === 0) {
          alert(t('downloader.importNone'))
        }

        return okCount > 0
      } catch (error) {
        alert(error?.message || String(error))
        return false
      } finally {
        if (typeof unsub === 'function') unsub()
        setIsConverting(false)
        setConversionMsg('')
      }
    },
    [t]
  )

  const handleDroppedJsonFiles = useCallback(
    async (jsonPaths) => {
      if (!Array.isArray(jsonPaths) || jsonPaths.length === 0) return false

      const importedPlaylists = []
      const sharedPlaylists = []

      for (const jsonPath of jsonPaths) {
        try {
          const content = await window.api.readTextFileHandler(jsonPath)
          if (!content) continue
          const parsed = JSON.parse(content)
          const downloadable = extractDownloadablePlaylists(parsed)
          if (downloadable.length > 0) {
            sharedPlaylists.push(...downloadable)
            continue
          }
          const imported = normalizeImportedPlaylists(parsed)
          if (imported.length > 0) {
            importedPlaylists.push(...imported)
          }
        } catch (error) {
          alert(error?.message || String(error))
        }
      }

      if (importedPlaylists.length > 0) {
        setUserPlaylists((prev) => [...prev, ...importedPlaylists])
        setSelectedSmartCollectionId(null)
        setSelectedUserPlaylistId(importedPlaylists[importedPlaylists.length - 1]?.id || null)
      }

      const sharedImported = await importSharedPlaylistsFromPayload(sharedPlaylists)
      return importedPlaylists.length > 0 || sharedImported
    },
    [importSharedPlaylistsFromPayload]
  )

  const handleDroppedM3UFiles = useCallback(
    async (m3uPaths) => {
      if (!Array.isArray(m3uPaths) || m3uPaths.length === 0) return false
      let imported = false
      for (const m3uPath of m3uPaths) {
        const content = await window.api.readTextFileHandler(m3uPath)
        if (!content) continue
        imported = (await importM3UPlaylistFromText(content, m3uPath)) || imported
      }
      return imported
    },
    [importM3UPlaylistFromText]
  )

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const droppedPaths = Array.from(files)
        .map((file) => file.path)
        .filter(Boolean)
      const jsonPaths = droppedPaths.filter((filePath) => filePath.toLowerCase().endsWith('.json'))
      const m3uPaths = droppedPaths.filter((filePath) => /\.m3u8?$/i.test(filePath))
      const otherPaths = droppedPaths.filter(
        (filePath) => !filePath.toLowerCase().endsWith('.json') && !/\.m3u8?$/i.test(filePath)
      )

      if (jsonPaths.length > 0) {
        await handleDroppedJsonFiles(jsonPaths)
      }

      if (m3uPaths.length > 0) {
        await handleDroppedM3UFiles(m3uPaths)
      }

      const audioFiles = await window.api.getAudioFilesFromPaths(otherPaths)
      if (audioFiles && audioFiles.length > 0) {
        await processFiles(audioFiles)
      }
    }
  }

  const handleClearPlaylist = () => {
    cancelCrossfade()
    if (useNativeEngineRef.current) window.api?.stopAudio?.()
    setPlaylist([])
    setActivePlaybackContext(createPlaybackContext('library', 'library', []))
    setUpNextQueue([])
    setCurrentIndex(-1)
    setIsPlaying(false)
    setDuration(0)
    setCurrentTime(0)
    setCoverUrlTrackPath('')
    setCoverUrl(null)
    setFailedDisplayCoverUrl(null)
    coverFailureFetchKeyRef.current = ''
    setLyricsSourceStatus({ kind: 'idle', detail: '', origin: '' })
    lastHistoryTrackedPathRef.current = ''
    pendingTrackStartRef.current = null
    playbackSessionSeedRef.current = null
    lastLoadedTrackPathRef.current = ''
    if (audioRef.current) audioRef.current.src = ''
  }

  const togglePlay = useCallback(async () => {
    const s = lastCastStatus
    if (isCastSessionActive(s) && s?.castKind === 'airplay') {
      await window.api?.cast?.airplayCommand?.(s.transportState === 'PLAYING' ? 'pause' : 'play')
      return
    }
    if (s?.dlnaEnabled && s?.currentUri && window.api?.pauseAudio && window.api?.playAudio) {
      if (s.transportState === 'PLAYING') {
        await window.api.pauseAudio()
      } else {
        await window.api.playAudio(
          s.currentUri,
          typeof s.positionSec === 'number' ? s.positionSec : 0,
          1.0
        )
      }
      return
    }
    if (currentIndex === -1 && playlist.length > 0) {
      setCurrentIndex(0)
    }
    setIsPlaying((prev) => !prev)
  }, [lastCastStatus, currentIndex, playlist.length])

  // Handle Spacebar to pause/play
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== 'Space' || e.altKey || e.ctrlKey || e.metaKey) {
        return
      }

      if (isEditableShortcutTarget(e.target || document.activeElement)) {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      togglePlay()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [togglePlay])

  const handleNext = useCallback(
    (options = {}) => {
      if (!options.preserveFade) {
        cancelCrossfade()
      }
      if (playlist.length > 0) {
        if (queuePlaybackEnabled) {
          const queueSnapshot = upNextQueueRef.current
          if (queueSnapshot.length > 0) {
            let nextPath = null
            const remaining = []
            for (const item of queueSnapshot) {
              const path = item?.path
              if (typeof path !== 'string' || !path) continue
              const exists = playlistRef.current.some((track) => track.path === path)
              if (!exists) continue
              if (!nextPath) nextPath = path
              else remaining.push({ path })
            }
            if (nextPath) {
              const nextIdx = playlistRef.current.findIndex((track) => track.path === nextPath)
              setUpNextQueue(remaining)
              if (nextIdx !== -1) {
                currentTimeRef.current = 0
                mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
                setCurrentIndex(nextIdx)
                setCurrentTime(0)
                setIsPlaying(true)
                return
              }
            }
          }
        }
        const sequence = getPlaybackSequenceSnapshot()
        const nextPath = getPlaybackSequencePath(sequence, { direction: 'next', playMode })
        if (!nextPath) return
        const nextIdx = playlistRef.current.findIndex((track) => track.path === nextPath)
        if (nextIdx === -1) return
        currentTimeRef.current = 0
        mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
        setCurrentIndex(nextIdx)
        setCurrentTime(0)
        setIsPlaying(true)
      }
    },
    [
      cancelCrossfade,
      playlist,
      queuePlaybackEnabled,
      playMode,
      currentIndex,
      getPlaybackSequenceSnapshot
    ]
  )

  const jumpToHistoryCursor = useCallback((targetHistoryIndex, options = {}) => {
    const historySnapshot = playbackHistoryRef.current
    if (!Array.isArray(historySnapshot) || historySnapshot.length === 0) return false

    const boundedIndex = Math.max(
      0,
      Math.min(
        Number.isFinite(targetHistoryIndex) ? targetHistoryIndex : historySnapshot.length - 1,
        historySnapshot.length - 1
      )
    )
    const candidatePath = historySnapshot[boundedIndex]?.path
    const nextIdx = playlistRef.current.findIndex((track) => track.path === candidatePath)

    if (nextIdx === -1) {
      console.warn('[history] entry is not in the current playlist:', candidatePath)
      return false
    }

    historyNavigationRef.current = true
    setCurrentIndex(nextIdx)
    setIsPlaying(true)
    if (options.consume) {
      setPlaybackHistory((prev) => {
        const next = prev.slice(0, boundedIndex)
        playbackHistoryRef.current = next
        return next
      })
    }
    return true
  }, [])

  const goBackInPlaybackHistory = useCallback(() => {
    return jumpToHistoryCursor(playbackHistoryRef.current.length - 1, { consume: true })
  }, [jumpToHistoryCursor])

  const clearPlaybackHistory = useCallback(() => {
    playbackHistoryRef.current = []
    setPlaybackHistory([])
  }, [])

  const removePlaybackHistoryEntry = useCallback((entryOrIndex) => {
    const targetIndex =
      typeof entryOrIndex === 'number' ? entryOrIndex : Number(entryOrIndex?.historyIndex)
    if (!Number.isInteger(targetIndex) || targetIndex < 0) return

    setPlaybackHistory((prev) => {
      if (targetIndex >= prev.length) return prev
      const next = prev.filter((_, index) => index !== targetIndex)
      playbackHistoryRef.current = next
      return next
    })
  }, [])

  const handleHistoryBack = useCallback(() => {
    goBackInPlaybackHistory()
  }, [goBackInPlaybackHistory])

  const handleHistoryJump = useCallback(
    (entryOrIndex) => {
      const historyIndex =
        typeof entryOrIndex === 'number' ? entryOrIndex : Number(entryOrIndex?.historyIndex)
      return jumpToHistoryCursor(historyIndex)
    },
    [jumpToHistoryCursor]
  )

  const handleHistoryClear = useCallback(() => {
    clearPlaybackHistory()
  }, [clearPlaybackHistory])

  // Native bridge: track ended -advance using the same rules as HTML audio
  useEffect(() => {
    if (window.api?.onAudioTrackEnded) {
      return window.api.onAudioTrackEnded(() => {
        if (sleepTimerActive && config.sleepTimerMode === 'track') {
          stopPlaybackForSleepTimer()
          cancelSleepTimer()
          return
        }
        handleTrackEndedAdvance()
      })
    }
  }, [
    cancelSleepTimer,
    config.sleepTimerMode,
    handleTrackEndedAdvance,
    sleepTimerActive,
    stopPlaybackForSleepTimer
  ])

  const getNextTrack = useCallback(() => {
    if (playlist.length === 0) return null
    if (queuePlaybackEnabled) {
      const queueSnapshot = upNextQueueRef.current
      if (queueSnapshot.length > 0) {
        for (const item of queueSnapshot) {
          const path = item?.path
          if (typeof path !== 'string' || !path) continue
          const exists = playlistRef.current.find((track) => track.path === path)
          if (exists) return exists
        }
      }
    }
    if (playMode === 'shuffle') {
      return null // Cannot reliably predict next track in shuffle
    } else if (playMode === 'single') {
      return playlist[currentIndex]
    } else {
      const nextPath = getPlaybackSequencePath(getPlaybackSequenceSnapshot(), {
        direction: 'next',
        playMode
      })
      return playlistRef.current.find((track) => track.path === nextPath) || null
    }
  }, [playlist, queuePlaybackEnabled, playMode, currentIndex, getPlaybackSequenceSnapshot])

  const nextTrack = getNextTrack()
  useEffect(() => {
    nextTrackRef.current = nextTrack
  }, [nextTrack])

  useEffect(() => {
    if (!config.preloadMV || !isPlaying || !currentTrackPath || !nextTrack?.path) return
    if (nextTrack.path === currentTrackPath) return

    const totalSec = Number(durationRef.current) || Number(duration) || 0
    const positionSec = Number(currentTimeRef.current) || Number(currentTime) || 0
    if (!(totalSec > 0) || positionSec < 0) return

    const remainingSec = totalSec - positionSec
    if (remainingSec > MV_NEXT_TRACK_PRELOAD_LEAD_SEC || remainingSec < 0) return

    const preloadKey = [
      currentTrackPath,
      nextTrack.path,
      config.mvSource || 'bilibili',
      config.mvQuality || 'high'
    ].join('::')
    if (nextMvPreloadKeyRef.current === preloadKey) return
    nextMvPreloadKeyRef.current = preloadKey

    void preloadMvForTrack(nextTrack, currentTrackPath).catch((e) => {
      console.warn('[MV] next track preload failed', e)
    })
  }, [
    config.mvQuality,
    config.mvSource,
    config.preloadMV,
    currentTime,
    currentTrackPath,
    duration,
    isPlaying,
    nextTrack,
    preloadMvForTrack
  ])

  useEffect(() => {
    if (!config.gaplessEnabled || !useNativeEngineRef.current) return
    const nextPath = nextTrack?.path
    if (nextPath && window.api?.audioPrebufferNext) {
      void window.api.audioPrebufferNext(nextPath)
    } else if (window.api?.audioCancelPrebuffer) {
      void window.api.audioCancelPrebuffer()
    }
  }, [nextTrack?.path, config.gaplessEnabled])

  useEffect(() => {
    if (!window.api?.onGaplessTrackChanged) return undefined
    return window.api.onGaplessTrackChanged((nextPath) => {
      const nextIdx = playlistRef.current.findIndex((t) => t.path === nextPath)
      if (nextIdx !== -1) {
        nativeSilentTrackSwitchRef.current = nextPath
        historyNavigationRef.current = false
        setUpNextQueue((prev) => prev.filter((item) => item?.path !== nextPath))
        currentTimeRef.current = 0
        mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
        setCurrentTime(0)
        setCurrentIndex(nextIdx)
        setIsPlaying(true)
        scheduleNativeSilentSwitchRecovery(nextPath, 'gapless')
      }
    })
  }, [scheduleNativeSilentSwitchRecovery])

  useEffect(() => {
    if (!window.api?.onAutomixTrackChanged) return undefined
    return window.api.onAutomixTrackChanged((nextPath) => {
      if (!nextPath) return
      const nextIdx = playlistRef.current.findIndex((t) => t.path === nextPath)
      if (nextIdx === -1) return
      nativeSilentTrackSwitchRef.current = nextPath
      historyNavigationRef.current = false
      crossfadeStateRef.current = {
        active: false,
        sourcePath: '',
        targetPath: '',
        pendingFadeIn: false
      }
      setUpNextQueue((prev) => prev.filter((item) => item?.path !== nextPath))
      currentTimeRef.current = 0
      mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
      setCurrentTime(0)
      setCurrentIndex(nextIdx)
      setIsPlaying(true)
      scheduleNativeSilentSwitchRecovery(nextPath, 'automix')
    })
  }, [scheduleNativeSilentSwitchRecovery])

  const handlePrev = useCallback(
    (options = {}) => {
      if (!options.preserveFade) {
        cancelCrossfade()
      }

      if (config.prevButtonMode === 'history') {
        const jumped = goBackInPlaybackHistory()
        if (jumped) return
      }

      const prevPath = getPlaybackSequencePath(getPlaybackSequenceSnapshot(), {
        direction: 'previous',
        playMode
      })
      const prevIdx = playlistRef.current.findIndex((track) => track.path === prevPath)
      if (prevIdx === -1) return
      currentTimeRef.current = 0
      mvSyncCooldownUntilRef.current = Date.now() + MV_TRACK_SWITCH_SYNC_COOLDOWN_MS
      setCurrentIndex(prevIdx)
      setCurrentTime(0)
      setIsPlaying(true)
    },
    [
      cancelCrossfade,
      config.prevButtonMode,
      goBackInPlaybackHistory,
      playMode,
      getPlaybackSequenceSnapshot
    ]
  )

  useEffect(() => {
    if (!window.api?.onPlayerCmd) return undefined
    return window.api.onPlayerCmd((cmd) => {
      if (cmd === 'next') {
        handleNext()
        return
      }
      if (cmd === 'prev') {
        handlePrev()
      }
    })
  }, [handleNext, handlePrev])

  useEffect(() => {
    if (config.crossfadeEnabled || !crossfadeStateRef.current.active) return
    cancelCrossfade()
  }, [cancelCrossfade, config.crossfadeEnabled])

  useEffect(() => {
    maybeArmNativeAutomixFromClock(currentTimeRef.current)
  }, [
    config.crossfadeDuration,
    config.crossfadeEnabled,
    config.gaplessEnabled,
    currentIndex,
    currentTime,
    duration,
    isPlaying,
    maybeArmNativeAutomixFromClock,
    nextTrack?.path,
    playlist
  ])

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const min = Math.floor(time / 60)
    const sec = Math.floor(time % 60)
    return `${min}:${sec < 10 ? '0' : ''}${sec}`
  }

  const ytIframeRef = useRef(null)
  const ytBackgroundIframeRef = useRef(null)
  const ytReadyRef = useRef(false)
  const ytFallbackTimerRef = useRef(null)
  const mvContainerRef = useRef(null)
  const biliVideoRef = useRef(null)
  const biliBackgroundVideoRef = useRef(null)
  const biliAudioRef = useRef(null)

  const pauseBiliDirectMedia = useCallback(() => {
    ;[biliVideoRef.current, biliBackgroundVideoRef.current, biliAudioRef.current].forEach(
      pauseMvMediaElement
    )
  }, [])

  const getActiveMvSyncKey = useCallback(
    (suffix = '') => `${currentTrackPath || ''}::${mvId?.source || ''}:${mvId?.id || ''}:${suffix}`,
    [currentTrackPath, mvId?.id, mvId?.source]
  )

  const shouldFreezeMvAtTrackEnd = useCallback((positionSec = null) => {
    const totalSec = Number(durationRef.current)
    if (!Number.isFinite(totalSec) || totalSec <= 0) return false
    const position =
      Number.isFinite(positionSec) && positionSec !== null
        ? Number(positionSec)
        : Number(currentTimeRef.current)
    if (!Number.isFinite(position) || position <= 0) return false
    return totalSec - position <= MV_TRACK_END_SYNC_FREEZE_SEC
  }, [])

  const shouldThrottleMvSeek = useCallback((seekRef, key, targetSec, minIntervalMs) => {
    const now = Date.now()
    const target = Number.isFinite(targetSec) ? targetSec : 0
    const last = seekRef.current || {}
    if (
      last.key === key &&
      now - (last.at || 0) < minIntervalMs &&
      Math.abs((last.target ?? -1) - target) < MV_DIRECT_SEEK_REPEAT_EPSILON_SEC
    ) {
      return true
    }
    seekRef.current = { key, at: now, target }
    return false
  }, [])

  const seekBiliDirectMedia = useCallback(
    (targetSec, options = {}) => {
      const target = Number(targetSec)
      if (!Number.isFinite(target)) return false
      const force = options.force === true
      if (!force && Date.now() < mvSyncCooldownUntilRef.current) return false

      const media = [
        biliVideoRef.current,
        biliBackgroundVideoRef.current,
        biliAudioRef.current
      ].filter(Boolean)
      if (!media.length) return false

      const primaryMedia =
        biliVideoRef.current || biliBackgroundVideoRef.current || biliAudioRef.current
      if (!force && isMvTargetPastMediaTail(primaryMedia, target)) return false

      const minIntervalMs = Number.isFinite(options.minIntervalMs)
        ? options.minIntervalMs
        : force
          ? MV_DIRECT_FORCE_SEEK_MIN_INTERVAL_MS
          : MV_DIRECT_HARD_SEEK_MIN_INTERVAL_MS
      if (
        shouldThrottleMvSeek(
          lastMvDirectSeekRef,
          getActiveMvSyncKey('direct'),
          target,
          minIntervalMs
        )
      ) {
        return false
      }

      const thresholdSec = Number.isFinite(options.thresholdSec)
        ? options.thresholdSec
        : force
          ? MV_DIRECT_MANUAL_SEEK_THRESHOLD_SEC
          : MV_DIRECT_AUTO_HARD_SEEK_THRESHOLD_SEC
      let didSeek = false

      media.forEach((el) => {
        const nextTime = clampMvMediaTargetTime(el, target)
        const current = Number(el.currentTime) || 0
        if (force || Math.abs(nextTime - current) > thresholdSec) {
          try {
            el.currentTime = nextTime
            didSeek = true
          } catch {
            /* ignore */
          }
        }
        try {
          el.playbackRate = playbackRateRef.current
        } catch {
          /* ignore */
        }
      })

      return didSeek
    },
    [getActiveMvSyncKey, shouldThrottleMvSeek]
  )

  useEffect(() => {
    if (!currentTrackPath) return
    pauseBiliDirectMedia()
  }, [currentTrackPath, pauseBiliDirectMedia])

  const shouldLoadActiveMvMedia =
    shouldLoadMvForSurface(config, { view, showLyrics }) &&
    !(showLyrics && isCurrentTrackMvTemporarilyHidden)
  const shouldLoadActiveBiliDirectStream = Boolean(
    mvId?.id && mvId?.source === 'bilibili' && shouldLoadActiveMvMedia
  )

  useEffect(() => {
    if (!mvId || !isSideLyricsMvEnabled(config) || !showLyrics) {
      return undefined
    }
    const el = mvContainerRef.current
    if (!el) return undefined
    const BASE_W = 1920
    const BASE_H = 1080
    const apply = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w <= 0 || h <= 0) return
      // Use a "cover" scale (max) to avoid letterboxing inside the MV card.
      const scale = Math.max(w / BASE_W, h / BASE_H) * 1.02
      el.style.setProperty('--mv-embed-scale', String(Math.max(scale, 0.0001)))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(el)
    return () => ro.disconnect()
  }, [mvId?.id, mvId?.source, config.enableMV, config.mvAsBackground, showLyrics])

  useEffect(() => {
    const nextKey = mvId?.id && mvId?.source ? `${mvId.source}:${mvId.id}` : ''
    if (lastMvIdentityRef.current !== nextKey) {
      lastMvIdentityRef.current = nextKey
      setBiliDirectStream(null)
    }
    setYoutubeMvLoginHint(false)
    if (mvId?.source === 'bilibili') {
      setMvPlaybackQuality(null)
    } else {
      setMvPlaybackQuality(null)
    }
  }, [mvId?.id, mvId?.source])

  useEffect(() => {
    if (!shouldLoadActiveBiliDirectStream) {
      setBiliDirectStream(null)
      setMvPlaybackQuality(null)
      return
    }
    const qMap = { ultra: 120, highfps: 116, high: 80, medium: 64, low: 16 }
    const qn = qMap[config.mvQuality || 'high'] || 80
    const cacheKey = `${mvId.id}::${qn}`
    const cached = readRuntimeCache(biliStreamCacheRef, cacheKey, BILI_STREAM_CACHE_TTL_MS)
    if (cached?.ok) {
      setBiliDirectStream(cached)
      setMvPlaybackQuality(cached.qualityDesc)
      return
    }
    let cancelled = false
    resolveBiliDirectStreamCached(mvId.id, qn)
      .then((r) => {
        if (cancelled) return
        if (r?.ok) {
          setBiliDirectStream((prev) =>
            prev?.videoUrl === r.videoUrl && prev?.audioUrl === r.audioUrl ? prev : r
          )
          setMvPlaybackQuality(r.qualityDesc)
          console.log(`[Bilibili] Direct stream: ${r.qualityDesc} (${r.format})`)
        } else {
          console.warn('[Bilibili] Stream resolve failed:', r?.error)
          const q = config.mvQuality || 'high'
          const biliMax = signInStatus.bilibili
            ? { high: '1080p', medium: '720p', low: '360p' }
            : { high: '480p', medium: '480p', low: '360p' }
          setMvPlaybackQuality(biliMax[q] || '480p')
        }
      })
      .catch((e) => {
        if (cancelled) return
        console.warn('[Bilibili] Stream resolve error:', e)
      })
    return () => {
      cancelled = true
    }
  }, [
    config.mvQuality,
    mvId?.id,
    mvId?.source,
    readRuntimeCache,
    resolveBiliDirectStreamCached,
    shouldLoadActiveBiliDirectStream,
    signInStatus.bilibili
  ])

  const refreshSignInStatus = useCallback(() => {
    window.api
      ?.checkSignInStatus?.()
      .then((s) => {
        if (s) setSignInStatus(s)
      })
      .catch(() => {})
  }, [])

  // Bilibili direct video: play/pause sync
  useEffect(() => {
    if (!mvId || mvId.source !== 'bilibili' || !biliDirectStream) return
    const applyPlaybackState = () => {
      ;[biliVideoRef, biliBackgroundVideoRef].forEach((ref) => {
        if (!ref.current) return
        if (isPlayingRef.current && !shouldFreezeMvAtTrackEnd()) {
          ref.current.play().catch(() => {})
        } else {
          ref.current.pause()
        }
      })
      if (biliAudioRef.current) {
        if (isPlayingRef.current && !shouldFreezeMvAtTrackEnd()) {
          biliAudioRef.current.play().catch(() => {})
        } else {
          biliAudioRef.current.pause()
        }
      }
    }
    const cooldownRemaining = mvSyncCooldownUntilRef.current - Date.now()
    if (cooldownRemaining > 0) {
      pauseBiliDirectMedia()
      const timer = window.setTimeout(applyPlaybackState, cooldownRemaining)
      return () => window.clearTimeout(timer)
    }
    applyPlaybackState()
  }, [isPlaying, mvId, biliDirectStream, pauseBiliDirectMedia, shouldFreezeMvAtTrackEnd])

  // Bilibili direct video: playback rate sync
  useEffect(() => {
    if (!mvId || mvId.source !== 'bilibili' || !biliDirectStream) return
    ;[biliVideoRef, biliBackgroundVideoRef].forEach((ref) => {
      if (ref.current) ref.current.playbackRate = playbackRate
    })
    if (biliAudioRef.current) biliAudioRef.current.playbackRate = playbackRate
  }, [playbackRate, mvId, biliDirectStream])

  // Bilibili direct video: WASAPI Exclusive Hardware Stutter Fix
  useEffect(() => {
    if (!isAudioExclusive || !biliDirectStream || !mvId || mvId.source !== 'bilibili') return
    let ctx = null
    const tmr = setTimeout(() => {
      const refs = [biliVideoRef.current, biliBackgroundVideoRef.current].filter(Boolean)
      if (!refs.length) return
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        ctx = new AudioContext()
        ctx.suspend()
        refs.forEach((el) => {
          ctx.createMediaElementSource(el) // Bypasses Chromium audio sync waiting for locked WASAPI endpoint
        })
        console.log(
          '[Fix] WebAudio WASAPI exclusive playback stutter fix applied to Bilibili video'
        )
      } catch (err) {
        console.warn('Failed to apply exclusive mode stutter fix', err)
      }
    }, 50)

    return () => {
      clearTimeout(tmr)
      if (ctx) ctx.close().catch(() => {})
    }
  }, [isAudioExclusive, biliDirectStream, mvId])

  const postToAllMvIframes = useCallback((msg, target = '*') => {
    ;[ytIframeRef, ytBackgroundIframeRef].forEach((ref) => {
      if (ref.current?.contentWindow) {
        ref.current.contentWindow.postMessage(msg, target)
      }
    })
  }, [])

  const postMvIframeCommand = useCallback(
    (func, args = []) => {
      if (!mvId || !shouldLoadActiveMvMedia) return
      if (mvId.source === 'youtube') {
        postToAllMvIframes(
          JSON.stringify({
            event: 'command',
            func,
            args
          })
        )
        return
      }
      if (mvId.source === 'bilibili' && !biliDirectStream?.videoUrl) {
        postToAllMvIframes(
          JSON.stringify({
            method: func,
            data: args.length <= 1 ? args[0] : args
          })
        )
      }
    },
    [biliDirectStream?.videoUrl, mvId, postToAllMvIframes, shouldLoadActiveMvMedia]
  )

  const postThrottledMvIframeSeek = useCallback(
    (func, args, targetSec, options = {}) => {
      const force = options.force !== false
      if (!force && Date.now() < mvSyncCooldownUntilRef.current) return false

      const target = Number(targetSec)
      const minIntervalMs = force ? MV_DIRECT_FORCE_SEEK_MIN_INTERVAL_MS : 1800
      if (
        shouldThrottleMvSeek(
          lastMvIframeSeekRef,
          getActiveMvSyncKey(`iframe:${func}`),
          Number.isFinite(target) ? target : 0,
          minIntervalMs
        )
      ) {
        return false
      }

      postMvIframeCommand(func, args)
      return true
    },
    [getActiveMvSyncKey, postMvIframeCommand, shouldThrottleMvSeek]
  )

  useEffect(() => {
    if (!mvId || !shouldLoadActiveMvMedia) return
    const applyIframePlaybackState = () => {
      if (mvId.source === 'youtube') {
        postMvIframeCommand(isPlayingRef.current ? 'playVideo' : 'pauseVideo')
        postMvIframeCommand('setPlaybackRate', [playbackRate])
        postMvIframeCommand(config.mvMuted ? 'mute' : 'unMute')
        return
      }
      if (mvId.source === 'bilibili' && !biliDirectStream?.videoUrl) {
        postMvIframeCommand(isPlayingRef.current ? 'play' : 'pause')
        postMvIframeCommand('volume', [config.mvMuted || isAudioExclusive ? 0 : 1])
      }
    }
    const cooldownRemaining = mvSyncCooldownUntilRef.current - Date.now()
    if (cooldownRemaining > 0) {
      if (mvId.source === 'youtube') postMvIframeCommand('pauseVideo')
      if (mvId.source === 'bilibili' && !biliDirectStream?.videoUrl) postMvIframeCommand('pause')
      const timer = window.setTimeout(applyIframePlaybackState, cooldownRemaining)
      return () => window.clearTimeout(timer)
    }
    applyIframePlaybackState()
  }, [
    biliDirectStream?.videoUrl,
    config.mvMuted,
    isAudioExclusive,
    isPlaying,
    mvId,
    playbackRate,
    postMvIframeCommand,
    shouldLoadActiveMvMedia
  ])

  const pushYTQuality = useCallback(() => {
    const qMap = { high: 'hd1080', medium: 'hd720', low: 'small' }
    const q = qMap[config.mvQuality || 'high'] || 'hd1080'
    postMvIframeCommand('setPlaybackQuality', [q])
  }, [config.mvQuality, postMvIframeCommand])

  const syncYTVideo = useCallback(
    (time, options = {}) => {
      if (!shouldLoadActiveMvMedia) return
      const audioT = Number(time) || 0
      const mvOffSec = (configRef.current.mvOffsetMs ?? 0) / 1000
      const t = Math.max(0, audioT + mvOffSec)
      const force = options.force !== false

      if (mvId?.source === 'bilibili') {
        if (biliDirectStream?.videoUrl) {
          seekBiliDirectMedia(t, {
            force,
            minIntervalMs: force
              ? MV_DIRECT_FORCE_SEEK_MIN_INTERVAL_MS
              : MV_DIRECT_HARD_SEEK_MIN_INTERVAL_MS,
            thresholdSec: force
              ? MV_DIRECT_MANUAL_SEEK_THRESHOLD_SEC
              : MV_DIRECT_AUTO_HARD_SEEK_THRESHOLD_SEC
          })
          return
        }
        const didSeek = postThrottledMvIframeSeek('seek', [Math.floor(t)], t, { force })
        if (didSeek && isPlayingRef.current) postMvIframeCommand('play')
        return
      }

      const didSeek = postThrottledMvIframeSeek('seekTo', [t, true], t, { force })
      if (didSeek && isPlayingRef.current) postMvIframeCommand('playVideo')
    },
    [
      biliDirectStream?.videoUrl,
      mvId?.source,
      postMvIframeCommand,
      postThrottledMvIframeSeek,
      seekBiliDirectMedia,
      shouldLoadActiveMvMedia
    ]
  )

  const restartPlaybackAfterMvLoaded = useCallback(
    (reason = '') => {
      if (configRef.current.restartMusicOnMvLoad !== true) return
      if (!isPlayingRef.current || !mvId?.id || !mvId?.source || !shouldLoadActiveMvMedia) return

      const trackPath = currentTrackPath || playlistRef.current[currentIndexRef.current]?.path || ''
      const restartKey = `${trackPath}::${mvId.source}:${mvId.id}`
      if (lastMvLoadRestartKeyRef.current === restartKey) return
      lastMvLoadRestartKeyRef.current = restartKey

      console.log(`[MV Sync] restarting music after MV load${reason ? `: ${reason}` : ''}`)
      currentTimeRef.current = 0
      setCurrentTime(0)
      markLyricsSeekJump(0)
      syncYTVideo(0, { force: true })

      if (useNativeEngineRef.current && window.api?.playAudio) {
        const activePath = playlistRef.current[currentIndexRef.current]?.path
        if (activePath) {
          window.api.playAudio(activePath, 0, playbackRateRef.current).catch(console.error)
        }
        return
      }

      if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0
          if (isPlayingRef.current) audioRef.current.play().catch(console.error)
        } catch (error) {
          console.error('MV restart playback error', error)
        }
      }
    },
    [currentTrackPath, markLyricsSeekJump, mvId?.id, mvId?.source, shouldLoadActiveMvMedia, syncYTVideo]
  )

  const syncYTVideoRef = useRef(syncYTVideo)
  syncYTVideoRef.current = syncYTVideo

  const seekNativePlayback = useCallback((trackPath, positionSec) => {
    if (!trackPath) return Promise.resolve(null)
    const nextTime = Math.max(0, Number(positionSec) || 0)
    const shouldResume = isPlayingRef.current === true
    if (window.api?.seekAudio) {
      return window.api.seekAudio(trackPath, nextTime, playbackRateRef.current, shouldResume)
    }
    if (shouldResume && window.api?.playAudio) {
      return window.api.playAudio(trackPath, nextTime, playbackRateRef.current)
    }
    return window.api?.pauseAudio?.() || Promise.resolve(null)
  }, [])

  const getMvSyncTime = useCallback(() => {
    if (useNativeEngineRef.current) {
      const activePath = playlistRef.current[currentIndexRef.current]?.path || ''
      const status = latestNativeAudioStatusRef.current
      if (nativeStatusPathMatchesActiveTrack(status?.filePath, activePath)) {
        const statusTime = Number(status?.currentTime)
        if (Number.isFinite(statusTime) && statusTime >= 0) return statusTime
      }
      return Math.max(0, Number(currentTimeRef.current) || 0)
    }
    return Math.max(0, Number(audioRef.current?.currentTime) || 0)
  }, [])

  useEffect(() => {
    if (!isPlaying || !mvId || !shouldLoadActiveMvMedia) return
    if (mvId.source !== 'youtube') return
    const id = window.setInterval(() => {
      if (isSeekingRef.current) return
      const syncTime = getMvSyncTime()
      if (shouldFreezeMvAtTrackEnd(syncTime)) return
      syncYTVideoRef.current(syncTime, { force: false })
    }, 3000)
    return () => clearInterval(id)
  }, [
    getMvSyncTime,
    isPlaying,
    mvId?.id,
    mvId?.source,
    shouldFreezeMvAtTrackEnd,
    shouldLoadActiveMvMedia
  ])

  useEffect(() => {
    if (
      !isPlaying ||
      !mvId ||
      !shouldLoadActiveMvMedia ||
      mvId.source !== 'bilibili' ||
      !biliDirectStream?.videoUrl
    )
      return
    let raf = 0
    let lastTickAt = 0
    const hardSeekThresholdSec = MV_DIRECT_AUTO_HARD_SEEK_THRESHOLD_SEC
    const rateNudgeThresholdSec = MV_DIRECT_RATE_NUDGE_THRESHOLD_SEC
    // Drift correction work is throttled to MV_DIRECT_DRIFT_TICK_MS (~5Hz) -
    // well below the rate-nudge threshold (200ms) - so we still keep the RAF
    // schedule in sync with the rendering pipeline but avoid running the full
    // body every frame while a 4K MV is decoding alongside Hi-Fi audio.
    const tick = () => {
      const now = Date.now()
      if (
        now - lastTickAt >= MV_DIRECT_DRIFT_TICK_MS &&
        !isSeekingRef.current &&
        now >= mvSyncCooldownUntilRef.current
      ) {
        lastTickAt = now
        const v = biliVideoRef.current || biliBackgroundVideoRef.current
        if (v) {
          const audioTime = getMvSyncTime()
          if (shouldFreezeMvAtTrackEnd(audioTime)) {
            if (now - lastMvTailPauseAtRef.current > 500) {
              lastMvTailPauseAtRef.current = now
              pauseBiliDirectMedia()
            }
          } else {
            const target = Math.max(0, audioTime + (configRef.current.mvOffsetMs ?? 0) / 1000)
            const drift = target - (v.currentTime || 0)
            const absDrift = Math.abs(drift)
            const targetPastTail = isMvTargetPastMediaTail(v, target)
            if (absDrift > hardSeekThresholdSec) {
              seekBiliDirectMedia(target, {
                force: false,
                thresholdSec: hardSeekThresholdSec,
                minIntervalMs: MV_DIRECT_HARD_SEEK_MIN_INTERVAL_MS
              })
            } else if (!targetPastTail && absDrift > rateNudgeThresholdSec) {
              const nudgedRate = Math.max(
                0.5,
                Math.min(2, playbackRateRef.current + (drift > 0 ? 0.04 : -0.04))
              )
              v.playbackRate = nudgedRate
              if (biliAudioRef.current) biliAudioRef.current.playbackRate = nudgedRate
            } else if (v.playbackRate !== playbackRateRef.current) {
              v.playbackRate = playbackRateRef.current
              if (biliAudioRef.current) biliAudioRef.current.playbackRate = playbackRateRef.current
            }
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [
    biliDirectStream?.videoUrl,
    getMvSyncTime,
    isPlaying,
    mvId?.id,
    mvId?.source,
    pauseBiliDirectMedia,
    shouldFreezeMvAtTrackEnd,
    shouldLoadActiveMvMedia,
    seekBiliDirectMedia
  ])

  const handleSeek = (e) => {
    if (isCastSessionActive(lastCastStatus)) return
    const val = parseFloat(e.target.value)
    if (!Number.isFinite(val)) return

    progressSeekValueRef.current = val
    setCurrentTime(val)
    markLyricsSeekJump(val)
    syncYTVideo(val)

    if (!isProgressDraggingRef.current) {
      const trackPath = playlist[currentIndex]?.path
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
      if (
        useNativeEngineRef.current &&
        trackPath &&
        (window.api?.seekAudio || window.api?.playAudio)
      ) {
        if (audioRef.current) audioRef.current.currentTime = val
        seekNativePlayback(trackPath, val).catch(console.error)
        seekTimerRef.current = setTimeout(() => setIsSeeking(false), 350)
      } else if (audioRef.current) {
        audioRef.current.currentTime = val
        seekTimerRef.current = setTimeout(() => setIsSeeking(false), 120)
      }
    }
  }

  const commitProgressSeek = useCallback(
    (overrideValue) => {
      if (!isProgressDraggingRef.current && !Number.isFinite(overrideValue)) return

      isProgressDraggingRef.current = false
      setIsProgressDragging(false)

      if (isCastSessionActive(lastCastStatus)) {
        setIsSeeking(false)
        return
      }

      const val = Number.isFinite(overrideValue) ? overrideValue : progressSeekValueRef.current
      if (!Number.isFinite(val)) {
        setIsSeeking(false)
        return
      }

      setCurrentTime(val)
      markLyricsSeekJump(val)
      syncYTVideo(val)

      const trackPath = playlist[currentIndex]?.path
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current)

      if (
        useNativeEngineRef.current &&
        trackPath &&
        (window.api?.seekAudio || window.api?.playAudio)
      ) {
        if (audioRef.current) audioRef.current.currentTime = val
        seekNativePlayback(trackPath, val).catch(console.error)
        seekTimerRef.current = setTimeout(() => setIsSeeking(false), 350)
      } else if (audioRef.current) {
        audioRef.current.currentTime = val
        seekTimerRef.current = setTimeout(() => setIsSeeking(false), 120)
      } else {
        setIsSeeking(false)
      }
    },
    [currentIndex, lastCastStatus, markLyricsSeekJump, playlist, seekNativePlayback, syncYTVideo]
  )

  const seekToPosition = useCallback(
    (positionSec) => {
      if (isCastSessionActive(lastCastStatus)) return
      const val = Number(positionSec)
      if (!Number.isFinite(val)) return
      const nextTime = Math.max(0, val)
      setIsSeeking(true)
      setCurrentTime(nextTime)
      markLyricsSeekJump(nextTime)
      syncYTVideo(nextTime)

      const trackPath = playlist[currentIndex]?.path
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
      if (
        useNativeEngineRef.current &&
        trackPath &&
        (window.api?.seekAudio || window.api?.playAudio)
      ) {
        if (audioRef.current) audioRef.current.currentTime = nextTime
        seekNativePlayback(trackPath, nextTime).catch(console.error)
        seekTimerRef.current = setTimeout(() => setIsSeeking(false), 350)
      } else if (audioRef.current) {
        audioRef.current.currentTime = nextTime
        seekTimerRef.current = setTimeout(() => setIsSeeking(false), 120)
      } else {
        setIsSeeking(false)
      }
    },
    [currentIndex, lastCastStatus, markLyricsSeekJump, playlist, seekNativePlayback, syncYTVideo]
  )

  useEffect(() => {
    if (!isProgressDragging) return undefined

    const finishSeek = () => {
      commitProgressSeek()
    }

    window.addEventListener('mouseup', finishSeek)
    window.addEventListener('touchend', finishSeek)
    window.addEventListener('touchcancel', finishSeek)

    return () => {
      window.removeEventListener('mouseup', finishSeek)
      window.removeEventListener('touchend', finishSeek)
      window.removeEventListener('touchcancel', finishSeek)
    }
  }, [isProgressDragging, commitProgressSeek])

  useEffect(() => {
    if (!mvId) return
    const ax = audioRef.current?.currentTime
    const t = typeof ax === 'number' && !Number.isNaN(ax) ? ax : currentTime
    syncYTVideo(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.mvOffsetMs])

  const handleExport = async () => {
    if (currentIndex === -1 || !playlist[currentIndex]) return
    setIsExporting(true)
    try {
      const track = playlist[currentIndex]
      const arrayBuffer = await window.api.readBufferHandler(track.path)

      // Offline Audio Processing
      const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
        2,
        1,
        44100
      )
      const audioData = await audioCtx.decodeAudioData(arrayBuffer.buffer || arrayBuffer)

      const rate = playbackRate
      const duration = audioData.duration / rate
      const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
        audioData.numberOfChannels,
        audioCtx.sampleRate * duration,
        audioCtx.sampleRate
      )

      const source = offlineCtx.createBufferSource()
      source.buffer = audioData
      source.playbackRate.value = rate

      source.connect(offlineCtx.destination)
      source.start(0)

      const renderedBuffer = await offlineCtx.startRendering()

      // Encode to WAV (simple implementation)
      const wavBuffer = audioBufferToWav(renderedBuffer)

      // Save it via IPC
      const result = await window.api.saveExportHandler(
        new Uint8Array(wavBuffer).buffer,
        `Nightcore_${track.name.replace('.mp3', '.wav')}`,
        configRef.current.uiLocale
      )

      if (result.success) {
        alert(t('player.exportWavSuccess'))
      }
    } catch (e) {
      console.error(e)
      alert(t('player.exportWavFailed', { message: e.message }))
    }
    setIsExporting(false)
  }

  // AudioBuffer to pure PCM WAV conversion helper
  const audioBufferToWav = (buffer) => {
    const numOfChan = buffer.numberOfChannels
    const length = buffer.length * numOfChan * 2 + 44
    const bufferArray = new ArrayBuffer(length)
    const view = new DataView(bufferArray)
    const channels = []
    let sample = 0
    let offset = 0
    let pos = 0

    const setUint16 = (data) => {
      view.setUint16(pos, data, true)
      pos += 2
    }
    const setUint32 = (data) => {
      view.setUint32(pos, data, true)
      pos += 4
    }

    setUint32(0x46464952) // "RIFF"
    setUint32(length - 8)
    setUint32(0x45564157) // "WAVE"
    setUint32(0x20746d66) // "fmt " chunk
    setUint32(16) // length = 16
    setUint16(1) // PCM (uncompressed)
    setUint16(numOfChan)
    setUint32(buffer.sampleRate)
    setUint32(buffer.sampleRate * 2 * numOfChan) // avg. bytes/sec
    setUint16(numOfChan * 2) // block-align
    setUint16(16) // 16-bit
    setUint32(0x61746164) // "data" - chunk
    setUint32(length - pos - 4) // chunk length

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i))
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]))
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0
        view.setInt16(pos, sample, true)
        pos += 2
      }
      offset++
    }
    return bufferArray
  }

  const hasDisplayMetadataOverrides = useMemo(
    () => Object.keys(displayMetadataOverrides || {}).length > 0,
    [displayMetadataOverrides]
  )

  const effectiveTrackMetaMap = useMemo(() => {
    if (!hasDisplayMetadataOverrides) return trackMetaMap
    const next = { ...trackMetaMap }
    for (const [path, override] of Object.entries(displayMetadataOverrides || {})) {
      const prev = next[path] || {}
      next[path] = {
        ...prev,
        ...override,
        cover: override?.cover || prev.cover || null
      }
    }
    return next
  }, [trackMetaMap, displayMetadataOverrides, hasDisplayMetadataOverrides])

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null
  const currentDisplayOverride = currentTrack?.path
    ? displayMetadataOverrides[currentTrack.path] || null
    : null
  const currentDisplayOverrideIdentity = useMemo(() => {
    if (!currentTrack || !currentDisplayOverride) return null
    if (!currentDisplayOverride.title && !currentDisplayOverride.artist) return null
    return resolveTrackIdentityFromMetadata({
      fileName: currentTrack.name || fileNameFromPath(currentTrack.path),
      title: currentDisplayOverride.title || '',
      artist: currentDisplayOverride.artist || '',
      albumArtist: currentDisplayOverride.albumArtist || ''
    })
  }, [currentDisplayOverride, currentTrack])
  const currentTrackEffectiveMeta = useMemo(
    () =>
      currentTrack?.path
        ? getEffectiveTrackMeta(trackMetaMap, displayMetadataOverrides, currentTrack.path)
        : null,
    [currentTrack?.path, displayMetadataOverrides, trackMetaMap]
  )
  const listenTogetherSyncContent = useMemo(
    () => ({
      coverUrl: coverUrl || '',
      mvId: mvId || null,
      lyrics: Array.isArray(lyrics) ? lyrics : []
    }),
    [coverUrl, mvId, lyrics]
  )
  const currentTrackInfo = useMemo(
    () => (currentTrack ? parseTrackInfo(currentTrack, currentTrackEffectiveMeta) : null),
    [currentTrack, currentTrackEffectiveMeta]
  )
  const currentTrackMeta = currentTrack?.path ? trackMetaMap[currentTrack.path] || null : null
  const currentBpmRaw = Number(
    technicalInfo.originalBpm || (currentTrackMeta?.bpmMeasured ? currentTrackMeta?.bpm : 0)
  )
  const currentBottomBarBpm =
    Number.isFinite(currentBpmRaw) && currentBpmRaw > 0 ? Math.round(currentBpmRaw) : null
  const currentBottomBarAdjustedBpm =
    currentBottomBarBpm && playbackRate !== 1
      ? Math.round(currentBottomBarBpm * playbackRate)
      : null
  const showBottomBarBpmDetecting =
    Boolean(currentTrack?.path) && !currentBottomBarBpm && bpmDetectionState === 'detecting'
  const mvFallbackRunningRef = useRef(false)
  const mvFallbackAttemptKeyRef = useRef('')

  const triggerAutoMvFallback = useCallback(
    async (reason = 'youtube-error') => {
      if (!window.api?.searchMVHandler) return
      if (!configRef.current?.autoFallbackToBilibili) return
      if (!shouldLoadActiveMvMedia) return
      if (!mvId || mvId.source !== 'youtube') return

      const title =
        metadata.title ||
        currentTrackInfo?.title ||
        (currentTrack ? stripExtension(currentTrack.name) : '')
      const artist =
        metadata.artist && metadata.artist !== 'Unknown Artist'
          ? metadata.artist
          : currentTrackInfo?.artist || ''

      const key = `${currentTrack?.path || title}::${mvId.id}`
      if (mvFallbackRunningRef.current || mvFallbackAttemptKeyRef.current === key) {
        return
      }

      mvFallbackRunningRef.current = true
      mvFallbackAttemptKeyRef.current = key

      try {
        const bilibiliHit = await searchBilibiliMv(title || 'music', artist || '')
        if (bilibiliHit?.id) {
          const resultMeta =
            bilibiliHit.result && typeof bilibiliHit.result === 'object' ? bilibiliHit.result : {}
          console.warn(
            `[MV Fallback] YouTube failed (${reason}), switched to Bilibili: ${bilibiliHit.id}`
          )
          setMvId({
            id: bilibiliHit.id,
            source: bilibiliHit.source || 'bilibili',
            title: resultMeta.title || '',
            author: resultMeta.author || ''
          })
        } else {
          console.warn(`[MV Fallback] YouTube failed (${reason}), no Bilibili result.`)
        }
      } catch (e) {
        console.warn(`[MV Fallback] fallback search failed: ${e?.message || e}`)
      } finally {
        mvFallbackRunningRef.current = false
      }
    },
    [
      mvId,
      metadata.title,
      metadata.artist,
      currentTrack,
      currentTrackInfo,
      searchBilibiliMv,
      shouldLoadActiveMvMedia
    ]
  )

  useEffect(() => {
    return () => {
      if (ytFallbackTimerRef.current) {
        clearTimeout(ytFallbackTimerRef.current)
        ytFallbackTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const handleYouTubeMessage = (event) => {
      const origin = event?.origin || ''
      if (!/youtube\.com$|youtube-nocookie\.com$/i.test(origin.replace(/^https?:\/\//, ''))) {
        return
      }
      if (!shouldLoadActiveMvMedia) return

      let payload = event.data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch (_) {
          return
        }
      }

      if (!payload || typeof payload !== 'object') return
      if (payload.event === 'onReady') {
        ytReadyRef.current = true
        if (ytFallbackTimerRef.current) {
          clearTimeout(ytFallbackTimerRef.current)
          ytFallbackTimerRef.current = null
        }
        pushYTQuality()
        restartPlaybackAfterMvLoaded('youtube-ready')
        return
      }

      if (payload.event === 'onPlaybackQualityChange') {
        console.log(`[MV Quality] YouTube playing at: ${payload.info}`)
        setMvPlaybackQuality(payload.info)
        return
      }

      if (payload.event !== 'onError') return

      const code = Number(payload.info)
      if ([153, 150, 101].includes(code) && config.autoFallbackToBilibili) {
        triggerAutoMvFallback(`youtube-error-${code}`)
      }
    }

    window.addEventListener('message', handleYouTubeMessage)
    return () => window.removeEventListener('message', handleYouTubeMessage)
  }, [
    config.autoFallbackToBilibili,
    triggerAutoMvFallback,
    pushYTQuality,
    restartPlaybackAfterMvLoaded,
    shouldLoadActiveMvMedia
  ])

  useEffect(() => {
    if (!mvId || !shouldLoadActiveMvMedia || mvId.source !== 'youtube' || !ytReadyRef.current)
      return
    pushYTQuality()
  }, [config.mvQuality, mvId, pushYTQuality, shouldLoadActiveMvMedia])

  const resolvedDisplayArtist = useMemo(() => {
    if (currentDisplayOverride?.artist) {
      return currentDisplayOverrideIdentity?.artist || currentDisplayOverride.artist
    }
    const metadataMatchesCurrentTrack = coverUrlTrackPath === currentTrack?.path
    if (metadataMatchesCurrentTrack && metadata.artist && metadata.artist !== 'Unknown Artist') {
      return metadata.artist
    }
    if (currentTrackInfo?.artist && currentTrackInfo.artist !== 'Unknown Artist')
      return currentTrackInfo.artist
    if (currentTrack && isStreamingTrackPath(currentTrack.path)) {
      const parsed = parseStreamingTrackPath(currentTrack.path)
      const raw = parsed?.raw || {}
      const artists = raw.artists || raw.artist || ''
      const artist = Array.isArray(artists)
        ? artists
            .map((item) => item?.name || item)
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join(' / ')
        : String(artists || '').trim()
      if (artist) return artist
    }
    return currentTrack ? t('player.nightcoreMode') : t('player.ellipsis')
  }, [
    coverUrlTrackPath,
    currentDisplayOverride,
    currentDisplayOverrideIdentity,
    currentTrackInfo,
    currentTrack,
    metadata.artist,
    t
  ])

  const dlnaUiOn = useMemo(() => isCastSessionActive(lastCastStatus), [lastCastStatus])
  const castPillLabel = useMemo(() => lastCastStatus?.castLabel || 'DLNA', [lastCastStatus])
  const castVirtualTrack = useMemo(() => buildCastVirtualTrack(lastCastStatus), [lastCastStatus])

  const displayMainTitle = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s)) {
      const meta = getCastStatusMeta(s)
      const title = (meta.title || '').trim()
      const trustedTitle = s?.castKind !== 'airplay' || s?.castMetadataTrusted
      return (
        (trustedTitle ? title : '') || (s?.castKind === 'airplay' ? 'AirPlay' : t('dlna.castTitle'))
      )
    }
    if (currentDisplayOverride?.title) {
      return currentDisplayOverrideIdentity?.title || currentDisplayOverride.title
    }
    if (coverUrlTrackPath === currentTrack?.path && metadata.title) return metadata.title
    if (currentTrackInfo?.title) return currentTrackInfo.title
    if (currentTrack && isStreamingTrackPath(currentTrack.path)) {
      const parsed = parseStreamingTrackPath(currentTrack.path)
      const raw = parsed?.raw || {}
      const title = currentTrack.title || currentTrack.info?.title || raw.name || raw.title || ''
      if (title) return title
    }
    if (currentTrack) return currentTrack.name.replace(/\.[^/.]+$/, '')
    return t('player.selectTrack')
  }, [
    coverUrlTrackPath,
    lastCastStatus,
    currentDisplayOverride,
    currentDisplayOverrideIdentity,
    metadata.title,
    currentTrackInfo,
    currentTrack,
    t
  ])

  const displayMainArtist = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s)) {
      const meta = getCastStatusMeta(s)
      const a = (meta.artist || '').trim()
      return (
        a || (s?.castKind === 'airplay' ? t('castDrawer.airplayShort') : t('dlna.networkMedia'))
      )
    }
    return resolvedDisplayArtist
  }, [lastCastStatus, resolvedDisplayArtist, t])

  const displayMainAlbum = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s)) {
      const meta = getCastStatusMeta(s)
      return (meta.album || '').trim() || 'Unknown Album'
    }
    if (currentDisplayOverride?.album) return currentDisplayOverride.album
    if (coverUrlTrackPath === currentTrack?.path && metadata.album) return metadata.album
    if (currentTrackInfo?.album) return currentTrackInfo.album
    if (currentTrack && isStreamingTrackPath(currentTrack.path)) {
      const parsed = parseStreamingTrackPath(currentTrack.path)
      const raw = parsed?.raw || {}
      const rawAlbum = raw.album || ''
      const album =
        currentTrack.album ||
        currentTrack.info?.album ||
        (typeof rawAlbum === 'string' ? rawAlbum : rawAlbum?.name || rawAlbum?.title || '')
      if (album) return album
    }
    return currentTrack?.info?.album || 'Unknown Album'
  }, [coverUrlTrackPath, lastCastStatus, currentDisplayOverride, metadata.album, currentTrackInfo, currentTrack])

  useEffect(() => {
    const track = currentTrack
    const trackBaseKey = track ? `${currentIndex}\u001f${track.path || ''}` : ''
    const displayedTitle = String(displayMainTitle || '').trim()
    const displayedArtist = String(displayMainArtist || '').trim()
    const displayedAlbum = String(displayMainAlbum || '').trim()
    const lastFmOverrides = {
      title: displayedTitle,
      artist:
        displayedArtist && displayedArtist !== t('player.nightcoreMode')
          ? displayedArtist
          : currentTrackInfo?.artist || '',
      album: displayedAlbum !== 'Unknown Album' ? displayedAlbum : currentTrackInfo?.album || '',
      duration: duration || currentTrackInfo?.duration || track?.info?.duration || 0
    }
    const trackKey = buildLastFmTrackIdentity(track, currentIndex, lastFmOverrides)

    if (!track || !trackBaseKey || !trackKey) {
      lastLastFmTrackKeyRef.current = ''
      lastLastFmNowPlayingKeyRef.current = ''
      lastLastFmScrobbleKeyRef.current = ''
      lastFmScrobbleInFlightRef.current = false
      return
    }

    if (lastLastFmTrackKeyRef.current !== trackBaseKey) {
      lastLastFmTrackKeyRef.current = trackBaseKey
      lastLastFmNowPlayingKeyRef.current = ''
      lastLastFmScrobbleKeyRef.current = ''
      lastFmScrobbleInFlightRef.current = false
      trackStartedAtRef.current = Date.now()
      scrobbledRef.current = false
    }

    if (!config.lastfmEnabled || !config.lastfmSessionKey || !window.api?.lastfm?.nowPlaying) return
    if (lastLastFmNowPlayingKeyRef.current === trackKey) return

    const payload = buildLastFmTrackPayload(track, lastFmOverrides)
    if (!payload) return

    let cancelled = false
    const sendNowPlaying = async () => {
      try {
        if (window.api?.lastfm?.setSession) {
          await window.api.lastfm.setSession(config.lastfmSessionKey, config.lastfmUsername || '')
        }
        const result = await window.api.lastfm.nowPlaying(
          payload.artist,
          payload.title,
          payload.album,
          Number(payload.duration) || 0
        )
        if (cancelled) return
        if (result?.ok) {
          lastLastFmNowPlayingKeyRef.current = trackKey
        } else {
          console.warn('[Last.fm] updateNowPlaying skipped/failed:', result)
        }
      } catch (error) {
        if (!cancelled) console.warn('[Last.fm] updateNowPlaying failed:', error)
      }
    }

    void sendNowPlaying()
    return () => {
      cancelled = true
    }
  }, [
    currentIndex,
    currentTrack,
    currentTrackInfo,
    config.lastfmEnabled,
    config.lastfmSessionKey,
    config.lastfmUsername,
    displayMainAlbum,
    displayMainArtist,
    displayMainTitle,
    duration,
    t
  ])

  useEffect(() => {
    if (!config.lastfmEnabled || !config.lastfmSessionKey || scrobbledRef.current) return
    const track = currentTrack
    if (!track || !window.api?.lastfm?.scrobble) return
    const displayedArtist = String(displayMainArtist || '').trim()
    const payload = buildLastFmTrackPayload(track, {
      title: displayMainTitle,
      artist:
        displayedArtist && displayedArtist !== t('player.nightcoreMode')
          ? displayedArtist
          : currentTrackInfo?.artist || '',
      album:
        displayMainAlbum !== 'Unknown Album' ? displayMainAlbum : currentTrackInfo?.album || '',
      duration: duration || currentTrackInfo?.duration || track?.info?.duration || 0
    })
    if (!payload) return
    const dur = Number(payload.duration) || 0
    if (currentTime >= getLastFmScrobbleThresholdSec(dur)) {
      const trackKey = buildLastFmTrackIdentity(track, currentIndex, {
        title: payload.title,
        artist: payload.artist,
        album: payload.album,
        duration: dur
      })
      if (lastFmScrobbleInFlightRef.current || lastLastFmScrobbleKeyRef.current === trackKey) return
      lastFmScrobbleInFlightRef.current = true
      void (async () => {
        try {
          if (window.api?.lastfm?.setSession) {
            await window.api.lastfm.setSession(config.lastfmSessionKey, config.lastfmUsername || '')
          }
          const result = await window.api.lastfm.scrobble(
            payload.artist,
            payload.title,
            payload.album,
            trackStartedAtRef.current || Date.now(),
            dur
          )
          if (result?.ok) {
            scrobbledRef.current = true
            lastLastFmScrobbleKeyRef.current = trackKey
          } else {
            console.warn('[Last.fm] scrobble skipped/failed:', result)
          }
        } catch (error) {
          console.warn('[Last.fm] scrobble failed:', error)
        } finally {
          lastFmScrobbleInFlightRef.current = false
        }
      })()
    }
  }, [
    currentTime,
    currentTrack,
    currentTrackInfo,
    config.lastfmEnabled,
    config.lastfmSessionKey,
    config.lastfmUsername,
    displayMainAlbum,
    displayMainArtist,
    displayMainTitle,
    duration,
    t
  ])

  const displayMainCoverUrl = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s)) {
      const meta = getCastStatusMeta(s)
      const u = (meta.albumArtUrl || '').trim()
      const cover = (meta.cover || meta.artworkUrl || '').trim()
      return cover || u || null
    }
    if (currentDisplayOverride?.cover) return currentDisplayOverride.cover
    if (!currentTrack?.path) return null
    if (isStreamingTrackPath(currentTrack.path)) {
      const parsed = parseStreamingTrackPath(currentTrack.path)
      const raw = parsed?.raw || {}
      const streamingCover =
        currentTrack?.cover ||
        currentTrack?.info?.cover ||
        currentTrackInfo?.cover ||
        effectiveTrackMetaMap[currentTrack.path]?.cover ||
        raw.cover ||
        null
      if (streamingCover) return streamingCover
    }
    const knownTrackCover =
      currentTrackInfo?.cover || effectiveTrackMetaMap[currentTrack.path]?.cover || null
    const isQqMusicTrack =
      currentTrack?.downloadProvider === 'qq' ||
      /(^|\/\/)y\.qq\.com\//i.test(currentTrack?.sourceUrl || '') ||
      /(^|\/\/)y\.qq\.com\//i.test(currentTrack?.mvOriginUrl || '')
    if (isQqMusicTrack) {
      return (
        [
          currentTrack?.cover,
          currentTrack?.info?.cover,
          effectiveTrackMetaMap[currentTrack.path]?.cover,
          currentTrackInfo?.cover
        ].find((value) => /(^|\/\/)(y|qpic)\.qq\.com\//i.test(String(value || ''))) || null
      )
    }
    if (coverUrlTrackPath === currentTrack.path && coverUrl) return coverUrl
    return knownTrackCover
  }, [
    lastCastStatus,
    currentDisplayOverride,
    currentTrack,
    currentTrack?.path,
    currentTrack?.downloadProvider,
    currentTrack?.sourceUrl,
    currentTrack?.mvOriginUrl,
    currentTrackInfo?.cover,
    effectiveTrackMetaMap,
    coverUrlTrackPath,
    coverUrl
  ])

  const displaySafeCoverUrl = useMemo(() => {
    if (!displayMainCoverUrl) return null
    return displayMainCoverUrl === failedDisplayCoverUrl ? null : displayMainCoverUrl
  }, [displayMainCoverUrl, failedDisplayCoverUrl])

  const castLyricsIdentity = useMemo(() => {
    if (!isCastSessionActive(lastCastStatus)) return ''
    return [
      castVirtualTrack?.source || lastCastStatus?.castKind || 'cast',
      castVirtualTrack?.path || lastCastStatus?.currentUri || 'stream',
      castVirtualTrack?.metadataTrusted ? 'trusted' : 'untrusted',
      castVirtualTrack?.title || '',
      castVirtualTrack?.artist || '',
      castVirtualTrack?.album || ''
    ].join('::')
  }, [lastCastStatus, castVirtualTrack])

  useEffect(() => {
    if (!isCastSessionActive(lastCastStatus)) {
      if (localLyricsBeforeCastRef.current && lastCastLyricsPathRef.current) {
        const snapshot = localLyricsBeforeCastRef.current
        lyricsRequestSeqRef.current += 1
        setLyrics(snapshot.lyrics || [])
        setActiveLyricIndex(snapshot.activeLyricIndex ?? -1)
        setLyricsMatchStatus(snapshot.lyricsMatchStatus || 'idle')
        setLyricsSourceStatus(
          snapshot.lyricsSourceStatus || { kind: 'idle', detail: '', origin: '' }
        )
        localLyricsBeforeCastRef.current = null
        lastCastLyricsPathRef.current = ''
      }
      return
    }

    const identity = castLyricsIdentity || `cast://${lastCastStatus?.castKind || 'cast'}`
    if (lastCastLyricsPathRef.current === identity) return
    if (!lastCastLyricsPathRef.current) {
      localLyricsBeforeCastRef.current = {
        lyrics,
        activeLyricIndex,
        lyricsMatchStatus,
        lyricsSourceStatus
      }
    }
    lastCastLyricsPathRef.current = identity

    const requestSeq = ++lyricsRequestSeqRef.current
    const isStaleRequest = () => requestSeq !== lyricsRequestSeqRef.current
    setLyricsCandidateItems([])
    setLyricsCandidateLoading(false)
    setLyrics([])
    setActiveLyricIndex(-1)
    setLyricsRenderTime(
      typeof lastCastStatus?.positionSec === 'number' ? lastCastStatus.positionSec : 0
    )

    if (!castVirtualTrack?.metadataTrusted || !castVirtualTrack?.title) {
      setLyricsMatchStatus('idle')
      setLyricsSourceStatus({ kind: 'idle', detail: '', origin: '' })
      return
    }

    const savedOverride = getLyricsOverrideForPath(castVirtualTrack.path)
    if (savedOverride?.raw) {
      const parsedOv = parseAnyLyrics(savedOverride.raw)
      if (parsedOv.length > 0) {
        setLyrics(parsedOv)
        setLyricsMatchStatus('matched')
        setLyricsSourceStatus({
          kind: 'cache',
          detail: savedOverride.source || 'manual',
          origin: savedOverride.origin || castVirtualTrack.source || ''
        })
        return
      }
    }

    let cancelled = false
    setLyricsMatchStatus('loading')
    setLyricsSourceStatus({ kind: 'loading', detail: '', origin: castVirtualTrack.source || '' })
    ;(async () => {
      try {
        const title = castVirtualTrack.title
        const titleVariants = buildLyricTitleVariants(title)
        if (titleVariants.length === 0) throw new Error('empty cast lyrics title')
        const artistRaw = (castVirtualTrack.artist || '').trim()
        const artistClean = cleanArtistForLyrics(artistRaw)
        const artistCandidates = [...extractParenArtistHints(title), artistClean, artistRaw].filter(
          Boolean
        )
        const audioDur =
          Number(lastCastStatus?.trackDurationSec || lastCastStatus?.airplayDurationSec) || 0

        const applyLrcLibPayload = (payload) => {
          const raw = pickLyricsFromLrcLibResult(payload, audioDur, {
            titleCandidates: titleVariants,
            rawTitle: title,
            artistCandidates
          })
          const parsed = parseAnyLyrics(raw)
          if (parsed.length === 0 || cancelled || isStaleRequest()) return false
          setLyrics(parsed)
          setLyricsMatchStatus('matched')
          setActiveLyricIndex(-1)
          setLyricsSourceStatus({
            kind: 'lrclib',
            detail: '',
            origin: castVirtualTrack.source || ''
          })
          if (raw && String(raw).trim()) {
            setLyricsOverrideForPath(castVirtualTrack.path, raw, {
              source: 'lrclib',
              origin: castVirtualTrack.source || '',
              preferredSource: 'lrclib'
            })
            setLyricsSourcePreferenceRevision((value) => value + 1)
          }
          return true
        }

        const tryPayload = async (url) => {
          const payload = await requestLrcLib(url)
          if (cancelled || isStaleRequest()) return true
          return applyLrcLibPayload(payload)
        }

        const tried = new Set()
        const tryUrl = (url) => {
          if (!url || tried.has(url)) return Promise.resolve(false)
          tried.add(url)
          return tryPayload(url)
        }

        for (const variant of titleVariants) {
          const artist = artistCandidates[0] || ''
          const params = new URLSearchParams({ track_name: variant })
          if (artist) params.set('artist_name', artist)
          if (castVirtualTrack.album) params.set('album_name', castVirtualTrack.album)
          if (await tryUrl(`https://lrclib.net/api/get?${params.toString()}`)) return
          if (artist) {
            const q = `${variant} ${artist}`.trim()
            if (await tryUrl(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`)) return
          }
          if (await tryUrl(`https://lrclib.net/api/search?q=${encodeURIComponent(variant)}`)) return
        }

        if (!cancelled && !isStaleRequest()) {
          setLyrics([{ time: 0, text: i18n.t('lyrics.none') }])
          setLyricsMatchStatus('none')
          setLyricsSourceStatus({ kind: 'none', detail: '', origin: castVirtualTrack.source || '' })
        }
      } catch (e) {
        if (!cancelled && !isStaleRequest()) {
          console.error('Cast lyrics error', e)
          setLyrics([{ time: 0, text: i18n.t('lyrics.none') }])
          setLyricsMatchStatus('none')
          setLyricsSourceStatus({ kind: 'none', detail: '', origin: castVirtualTrack.source || '' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [castLyricsIdentity])

  const castMvIdentity = useMemo(() => {
    if (!castVirtualTrack?.metadataTrusted || !castVirtualTrack.title) return ''
    return [
      castVirtualTrack.source,
      castVirtualTrack.title,
      castVirtualTrack.artist,
      castVirtualTrack.album
    ].join('::')
  }, [castVirtualTrack])

  useEffect(() => {
    if (!isCastSessionActive(lastCastStatus)) {
      if (
        localMvBeforeCastRef.current &&
        lastResolvedMvTrackPathRef.current.startsWith('cast://')
      ) {
        const snapshot = localMvBeforeCastRef.current
        setMvId(snapshot.mvId || null)
        setBiliDirectStream(snapshot.biliDirectStream || null)
        setMvPlaybackQuality(snapshot.mvPlaybackQuality || null)
        lastResolvedMvTrackPathRef.current = currentTrackPath || ''
        localMvBeforeCastRef.current = null
      }
      return
    }
    const identity = castVirtualTrack?.path || `cast://${lastCastStatus?.castKind || 'cast'}`
    if (lastResolvedMvTrackPathRef.current === identity) return
    if (!lastResolvedMvTrackPathRef.current.startsWith('cast://')) {
      localMvBeforeCastRef.current = { mvId, biliDirectStream, mvPlaybackQuality }
    }
    lastResolvedMvTrackPathRef.current = identity
    setYoutubeMvLoginHint(false)
    setMvId(null)
    setBiliDirectStream(null)
    setMvPlaybackQuality(null)
  }, [
    lastCastStatus,
    castVirtualTrack?.path,
    currentTrackPath,
    mvId,
    biliDirectStream,
    mvPlaybackQuality
  ])

  useEffect(() => {
    if (!castMvIdentity || !castVirtualTrack?.metadataTrusted) return
    if (!window.api?.searchMVHandler || !mvLoadSurfaceActive) {
      return
    }

    let cancelled = false
    const mvSource = config.mvSource || 'bilibili'
    const title = castVirtualTrack.title
    const artist = castVirtualTrack.artist
    const cleanedTitle = cleanTitleForSearch(title)
    const mvSearchContext = { title: cleanedTitle, artist: artist || '' }
    const mvSearchContextKey = `${cleanedTitle.toLowerCase()}::${String(artist || '').toLowerCase()}`
    const mvQueries =
      mvSource === 'bilibili'
        ? buildBilibiliAutoMvQueries(cleanedTitle, artist || '')
        : buildYoutubeAutoMvQueries(cleanedTitle, artist || '')

    setIsSearchingMV(true)
    ;(async () => {
      try {
        const persistedMv = getMvOverrideForPath(castVirtualTrack.path)
        if (persistedMv?.id && persistedMv?.source) {
          if (!cancelled) {
            setMvId((prev) => {
              const nextMv = {
                id: persistedMv.id,
                source: persistedMv.source,
                title: persistedMv.title || '',
                author: persistedMv.author || ''
              }
              return prev?.id === nextMv.id &&
                prev?.source === nextMv.source &&
                (prev?.title || '') === nextMv.title &&
                (prev?.author || '') === nextMv.author
                ? prev
                : nextMv
            })
          }
          return
        }

        if (config.autoSearchMV || config.preloadMV) {
          let foundCandidates = false
          for (const mvQuery of mvQueries) {
            const searchCacheKey = `${castVirtualTrack.path}::${mvSource}::${mvQuery.toLowerCase()}::${mvSearchContextKey}`
            const cached = autoMvSearchByTrackRef.current.get(searchCacheKey)
            const searchResult =
              cached === undefined
                ? await searchMvWithCache(mvQuery, mvSource, mvSearchContext)
                : cached
            if (cached === undefined) {
              autoMvSearchByTrackRef.current.set(searchCacheKey, searchResult || null)
            }
            if (cancelled) return
            const items = orderMvSearchItems(searchResult, mvSource)
            if (items.length > 0) {
              foundCandidates = true
              setAutoMvSearchResults({
                status: 'ready',
                filePath: castVirtualTrack.path,
                title: cleanedTitle,
                artist: artist || '',
                source: mvSource,
                query: mvQuery,
                items,
                updatedAt: Date.now()
              })
              const hit =
                getAutoMvSearchHit(searchResult, mvSource) ||
                getBestEffortMvSearchHit(searchResult, mvSource)
              const resultMeta =
                hit?.result && typeof hit.result === 'object' ? hit.result : items[0] || {}
              const selectedId = hit?.id || items[0]?.id
              if (selectedId) {
                setMvId((prev) => {
                  const nextMv = {
                    id: selectedId,
                    source: hit?.source || items[0]?.source || mvSource,
                    title: resultMeta.title || '',
                    author: resultMeta.author || ''
                  }
                  return prev?.id === nextMv.id &&
                    prev?.source === nextMv.source &&
                    (prev?.title || '') === nextMv.title &&
                    (prev?.author || '') === nextMv.author
                    ? prev
                    : nextMv
                })
              }
              break
            }
          }
          if (!foundCandidates && !cancelled) {
            setAutoMvSearchResults({
              status: 'empty',
              filePath: castVirtualTrack.path,
              title: cleanedTitle,
              artist: artist || '',
              source: mvSource,
              query: mvQueries[0] || cleanedTitle,
              items: [],
              updatedAt: Date.now()
            })
          }
          if (cancelled) return
          if (!foundCandidates) {
            setMvId(null)
            setBiliDirectStream(null)
            setMvPlaybackQuality(null)
          }
          return
        }

        let searchResult = null
        let fallbackHit = null
        for (const mvQuery of mvQueries) {
          const searchCacheKey = `${castVirtualTrack.path}::${mvSource}::${mvQuery.toLowerCase()}::${mvSearchContextKey}`
          searchResult = autoMvSearchByTrackRef.current.get(searchCacheKey)
          if (searchResult === undefined) {
            searchResult = await searchMvWithCache(mvQuery, mvSource, mvSearchContext)
            autoMvSearchByTrackRef.current.set(searchCacheKey, searchResult || null)
          }
          if (cancelled) return
          const exactHit = getAutoMvSearchHit(searchResult, mvSource)
          if (exactHit) break
          const bestEffortHit = getBestEffortMvSearchHit(searchResult, mvSource)
          if (bestEffortHit?.id && (!fallbackHit || bestEffortHit.score > fallbackHit.score)) {
            fallbackHit = bestEffortHit
          }
        }
        if (cancelled) return
        const hit =
          (searchResult ? getAutoMvSearchHit(searchResult, mvSource) : null) || fallbackHit
        if (hit?.id) {
          const resultMeta = hit.result && typeof hit.result === 'object' ? hit.result : {}
          setMvId((prev) => {
            const nextMv = {
              id: hit.id,
              source: hit.source,
              title: resultMeta.title || '',
              author: resultMeta.author || ''
            }
            return prev?.id === nextMv.id &&
              prev?.source === nextMv.source &&
              (prev?.title || '') === nextMv.title &&
              (prev?.author || '') === nextMv.author
              ? prev
              : nextMv
          })
          return
        }
        setMvId(null)
        setBiliDirectStream(null)
        setMvPlaybackQuality(null)
      } catch (e) {
        console.error('Cast MV search error', e)
      } finally {
        if (!cancelled) setIsSearchingMV(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    castMvIdentity,
    castVirtualTrack,
    config.autoSearchMV,
    config.preloadMV,
    config.mvSource,
    mvLoadSurfaceActive,
    searchMvWithCache
  ])

  const customWallpaperUrl = useMemo(() => {
    if (!config.customBgPath) return ''
    return (
      window.api?.pathToFileURL?.(config.customBgPath) ||
      `file:///${String(config.customBgPath).replace(/\\/g, '/')}`
    )
  }, [config.customBgPath])
  const lyricsWallpaperUrl = useMemo(() => {
    if (!config.lyricsBackgroundWallpaperPath) return ''
    return (
      window.api?.pathToFileURL?.(config.lyricsBackgroundWallpaperPath) ||
      `file:///${String(config.lyricsBackgroundWallpaperPath).replace(/\\/g, '/')}`
    )
  }, [config.lyricsBackgroundWallpaperPath])
  const wallpaperOpacity = useMemo(
    () => normalizeUnitOpacity(config.customBgOpacity, DEFAULT_CONFIG.customBgOpacity ?? 1),
    [config.customBgOpacity]
  )
  const hasVisibleWallpaper = wallpaperOpacity > 0.001
  const uiPanelOpacity = useMemo(
    () => normalizeUnitOpacity(config.uiBgOpacity, DEFAULT_CONFIG.uiBgOpacity ?? 0.6),
    [config.uiBgOpacity]
  )
  const uiPanelBlur = useMemo(() => {
    const raw = Number(config.uiBlur !== undefined ? config.uiBlur : (DEFAULT_CONFIG.uiBlur ?? 20))
    return Number.isFinite(raw) ? Math.max(0, raw) : (DEFAULT_CONFIG.uiBlur ?? 20)
  }, [config.uiBlur])
  const isGlassTransparent = uiPanelOpacity <= 0.051
  const isGlassBlurOff = uiPanelBlur <= 0.001 || isGlassTransparent
  const isGlassClear = isGlassTransparent && isGlassBlurOff

  useEffect(() => {
    if (!currentTrack?.path || !displaySafeCoverUrl) return
    if (
      !isCastSessionActive(lastCastStatus) &&
      !currentDisplayOverride?.cover &&
      coverUrlTrackPath !== currentTrack.path
    ) {
      return
    }

    const albumName =
      metadata.album || currentTrackInfo?.album || currentTrack?.info?.album || 'Singles'
    const syncKey = `${currentTrack.path}::${displaySafeCoverUrl}::${albumName}`
    if (syncedDisplayCoverCacheKeyRef.current === syncKey) return
    syncedDisplayCoverCacheKeyRef.current = syncKey

    const title =
      metadata.title ||
      currentTrackInfo?.title ||
      currentTrack.name?.replace(/\.[^/.]+$/, '') ||
      null
    const artist =
      (metadata.artist && metadata.artist !== 'Unknown Artist' ? metadata.artist : null) ||
      currentTrackInfo?.artist ||
      null
    const albumArtist = metadata.albumArtist || currentTrackInfo?.albumArtist || null
    const coverEntry = {
      title,
      artist,
      album: albumName,
      albumArtist,
      trackNo: metadata.trackNo ?? currentTrackInfo?.trackNo ?? null,
      discNo: metadata.discNo ?? currentTrackInfo?.discNo ?? null,
      cover: displaySafeCoverUrl,
      coverExtractorVersion: trackMetaMap[currentTrack.path]?.coverExtractorVersion || null,
      duration: duration || currentTrackInfo?.duration || null,
      coverChecked: true,
      codec: technicalInfo.codec || trackMetaMap[currentTrack.path]?.codec || null,
      bitrateKbps: technicalInfo.bitrate
        ? Math.round(technicalInfo.bitrate / 1000)
        : trackMetaMap[currentTrack.path]?.bitrateKbps || null,
      sampleRateHz:
        technicalInfo.sampleRate || trackMetaMap[currentTrack.path]?.sampleRateHz || null,
      bitDepth: technicalInfo.bitDepth || trackMetaMap[currentTrack.path]?.bitDepth || null,
      channels: technicalInfo.channels || trackMetaMap[currentTrack.path]?.channels || null,
      isMqa: technicalInfo.isMqa === true || trackMetaMap[currentTrack.path]?.isMqa === true,
      bpm: technicalInfo.originalBpm || trackMetaMap[currentTrack.path]?.bpm || null,
      lyrics: trackMetaMap[currentTrack.path]?.lyrics || null,
      lyricsExtractorVersion: trackMetaMap[currentTrack.path]?.lyricsExtractorVersion || null
    }

    setTrackMetaMap((prev) => {
      const existing = prev[currentTrack.path] || {}
      if (existing.cover === displaySafeCoverUrl && existing.coverChecked === true) return prev
      return {
        ...prev,
        [currentTrack.path]: {
          ...existing,
          ...coverEntry
        }
      }
    })

    if (albumName) {
      setAlbumCoverMap((prev) => {
        if (prev[albumName]) return prev
        return { ...prev, [albumName]: displaySafeCoverUrl }
      })
      persistAlbumCoverCacheItems({
        album: albumName,
        artist: albumArtist || artist || '',
        cover: displaySafeCoverUrl
      })
    }

    writeTrackMetaCache({ [currentTrack.path]: coverEntry })
  }, [
    currentTrack,
    currentTrackInfo,
    coverUrlTrackPath,
    currentDisplayOverride?.cover,
    displaySafeCoverUrl,
    duration,
    lastCastStatus,
    metadata.album,
    metadata.albumArtist,
    metadata.artist,
    metadata.discNo,
    metadata.title,
    metadata.trackNo,
    persistAlbumCoverCacheItems,
    technicalInfo.bitrate,
    technicalInfo.channels,
    technicalInfo.codec,
    technicalInfo.originalBpm,
    technicalInfo.sampleRate,
    trackMetaMap
  ])

  const handleDisplayCoverError = () => {
    if (!displayMainCoverUrl) return
    setFailedDisplayCoverUrl(displayMainCoverUrl)
    const failureKey = [
      displayMainCoverUrl,
      displayMainTitle,
      displayMainArtist,
      displayMainAlbum
    ].join('::')
    if (coverFailureFetchKeyRef.current === failureKey) return
    coverFailureFetchKeyRef.current = failureKey
    fetchCloudCover(displayMainTitle, displayMainArtist, trackLoadSeqRef.current, {
      album: displayMainAlbum,
      excludeUrl: displayMainCoverUrl
    })
  }

  const lyricsNeedsCoverTheme =
    showLyrics &&
    !(isImmersiveLyricsMvEnabled(config) && mvId) &&
    normalizeLyricsBackgroundMode(config.lyricsBackgroundMode) === 'cover'
  const shouldResolveDynamicCoverTheme = config.themeDynamicCoverColor || lyricsNeedsCoverTheme

  useEffect(() => {
    if (!shouldResolveDynamicCoverTheme || !displaySafeCoverUrl) {
      setDynamicCoverTheme(null)
      return
    }
    let cancelled = false
    extractAverageHexFromSrc(displaySafeCoverUrl)
      .then((hex) => {
        if (cancelled) return
        if (hex) setDynamicCoverTheme(generatePaletteFromHex(hex))
        else setDynamicCoverTheme(null)
      })
      .catch(() => {
        if (!cancelled) setDynamicCoverTheme(null)
      })
    return () => {
      cancelled = true
    }
  }, [shouldResolveDynamicCoverTheme, displaySafeCoverUrl])

  const buildShareCardSnapshot = useCallback(
    (track) => {
      if (!track) return null
      const info = parseTrackInfo(track, trackMetaMap[track.path])
      const title = info?.title || stripExtension(track.name || '') || t('player.selectTrack')
      const artist =
        info?.artist && info.artist !== 'Unknown Artist' ? info.artist : t('common.unknownArtist')
      const album = info?.album || 'Unknown Album'
      const cover =
        info?.cover ||
        trackMetaMap?.[track.path]?.cover ||
        (currentTrack?.path === track.path ? displaySafeCoverUrl : null) ||
        null
      return {
        title,
        artist,
        album,
        cover:
          typeof cover === 'string' && cover.length > MAX_SHARE_CARD_COVER_CHARS
            ? displaySafeCoverUrl || null
            : cover
      }
    },
    [trackMetaMap, currentTrack, displaySafeCoverUrl, t]
  )

  const waitForShareCardPaint = useCallback(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
    []
  )

  const handleCopyTrackCardImage = useCallback(
    async (track) => {
      if (isCardActionBusy) return
      const snapshot = buildShareCardSnapshot(track)
      if (!snapshot) return
      setIsCardActionBusy(true)
      try {
        setShareCardSnapshot(snapshot)
        await waitForShareCardPaint()
        await copySongCardImage(songCardCaptureRef.current, window.api)
      } catch (err) {
        alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
      } finally {
        setShareCardSnapshot(null)
        setIsCardActionBusy(false)
      }
    },
    [isCardActionBusy, buildShareCardSnapshot, waitForShareCardPaint, t]
  )

  const handleSaveTrackCardImage = useCallback(
    async (track) => {
      if (isCardActionBusy) return
      const snapshot = buildShareCardSnapshot(track)
      if (!snapshot) return
      setIsCardActionBusy(true)
      try {
        setShareCardSnapshot(snapshot)
        await waitForShareCardPaint()
        await saveSongCardImage(
          songCardCaptureRef.current,
          window.api,
          `${snapshot.title}-share-card`
        )
      } catch (err) {
        alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
      } finally {
        setShareCardSnapshot(null)
        setIsCardActionBusy(false)
      }
    },
    [isCardActionBusy, buildShareCardSnapshot, waitForShareCardPaint, t]
  )

  const handleDeleteTrackFile = useCallback(
    async (track) => {
      const filePath = track?.path || ''
      if (!filePath || !isLocalAudioFilePath(filePath)) {
        alert(t('contextMenu.actionFailed', { detail: 'path_unavailable' }))
        return
      }
      if (!window.api?.deleteAudioFileHandler) {
        alert(t('contextMenu.actionFailed', { detail: 'delete_unavailable' }))
        return
      }

      const info = parseTrackInfo(track, trackMetaMapRef.current?.[filePath] || null)
      const title = info?.title || stripExtension(track?.name || fileNameFromPath(filePath))
      const ok = window.confirm(
        t('contextMenu.confirmDeleteTrack', {
          title,
          path: filePath,
          defaultValue: `Delete "${title}" from its folder?\n\n${filePath}`
        })
      )
      if (!ok) return

      const deletingCurrentTrack = playlistRef.current[currentIndexRef.current]?.path === filePath
      if (deletingCurrentTrack) {
        try {
          if (window.api?.stopAudio) await window.api.stopAudio()
        } catch {
          /* best effort release before deleting */
        }
        try {
          if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.removeAttribute('src')
            audioRef.current.src = ''
            audioRef.current.load()
          }
        } catch {
          /* best effort release before deleting */
        }
      }

      const result = await window.api.deleteAudioFileHandler(filePath)
      if (!result?.ok) {
        alert(t('contextMenu.actionFailed', { detail: result?.error || 'delete_failed' }))
        return
      }

      applyLibraryFolderDelta({
        renamed: [],
        removedPaths: [result.path || filePath],
        added: []
      })
    },
    [applyLibraryFolderDelta, t]
  )

  const transportIsPlaying = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s)) {
      return s.transportState === 'PLAYING'
    }
    return isPlaying
  }, [lastCastStatus, isPlaying])

  const playerTransportPluginContext = useMemo(
    () => ({
      trackPath: currentTrack?.path || '',
      title: displayMainTitle || '',
      artist: displayMainArtist || '',
      album: displayMainAlbum || '',
      isPlaying: transportIsPlaying === true
    }),
    [currentTrack?.path, displayMainTitle, displayMainArtist, displayMainAlbum, transportIsPlaying]
  )

  const displayProgressTime = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s)) {
      return typeof s.positionSec === 'number' ? s.positionSec : 0
    }
    return currentTime
  }, [lastCastStatus, currentTime])
  const displayProgressTimeRef = useRef(0)
  const playbackClockAnchorRef = useRef(
    createPlaybackClockAnchor(0, 0, { isPlaying: false, playbackRate: 1 })
  )

  useEffect(() => {
    displayProgressTimeRef.current = displayProgressTime
    playbackClockAnchorRef.current = createPlaybackClockAnchor(
      displayProgressTime,
      performance.now(),
      {
        isPlaying: transportIsPlaying === true,
        playbackRate
      }
    )
  }, [displayProgressTime, playbackRate, transportIsPlaying])

  const getLiveLyricsPlaybackTime = useCallback(() => {
    const audio = audioRef.current
    if (!useNativeEngineRef.current && !isCastSessionActive(lastCastStatus)) {
      const audioTime = Number(audio?.currentTime)
      return Number.isFinite(audioTime) ? Math.max(0, audioTime) : displayProgressTimeRef.current
    }

    return estimatePlaybackClockPosition(playbackClockAnchorRef.current, performance.now())
  }, [lastCastStatus])

  const displayProgressDuration = useMemo(() => {
    const s = lastCastStatus
    if (isCastSessionActive(s) && (s.trackDurationSec ?? 0) > 0) {
      return s.trackDurationSec
    }
    return duration
  }, [lastCastStatus, duration])

  useEffect(() => {
    if (!currentTrack?.path && !isCastSessionActive(lastCastStatus)) {
      clearMediaSession()
      return undefined
    }

    installMediaSessionHandlers({
      play: () => {
        if (!transportIsPlaying) void togglePlay()
      },
      pause: () => {
        if (transportIsPlaying) void togglePlay()
      },
      stop: () => {
        if (transportIsPlaying) void togglePlay()
        seekToPosition(0)
      },
      previoustrack: () => handlePrev(),
      nexttrack: () => handleNext(),
      seekbackward: (details = {}) => {
        const offset = Number(details.seekOffset)
        seekToPosition(displayProgressTimeRef.current - (Number.isFinite(offset) ? offset : 10))
      },
      seekforward: (details = {}) => {
        const offset = Number(details.seekOffset)
        seekToPosition(displayProgressTimeRef.current + (Number.isFinite(offset) ? offset : 10))
      },
      seekto: (details = {}) => {
        const target = Number(details.seekTime)
        if (Number.isFinite(target)) seekToPosition(target)
      }
    })

    return () => clearMediaSessionHandlers()
  }, [
    currentTrack?.path,
    handleNext,
    handlePrev,
    lastCastStatus,
    seekToPosition,
    togglePlay,
    transportIsPlaying
  ])

  useEffect(() => {
    if (!currentTrack?.path && !isCastSessionActive(lastCastStatus)) return
    syncMediaSessionMetadata({
      title: displayMainTitle || '',
      artist: displayMainArtist || '',
      album: displayMainAlbum || '',
      coverUrl: displaySafeCoverUrl || ''
    })
  }, [
    currentTrack?.path,
    displayMainAlbum,
    displayMainArtist,
    displayMainTitle,
    displaySafeCoverUrl,
    lastCastStatus
  ])

  useEffect(() => {
    if (!currentTrack?.path && !isCastSessionActive(lastCastStatus)) return
    syncMediaSessionPlayback({
      isPlaying: transportIsPlaying === true,
      position: displayProgressTime || 0,
      duration: displayProgressDuration || 0,
      playbackRate
    })
  }, [
    currentTrack?.path,
    displayProgressDuration,
    displayProgressTime,
    lastCastStatus,
    playbackRate,
    transportIsPlaying
  ])

  const castSendCurrentTrack = useMemo(() => {
    if (!currentTrack?.path) return null
    const codecText =
      technicalInfo.codec ||
      currentTrackMeta?.codec ||
      (currentTrack?.name ? currentTrack.name.split('.').pop() : '')
    const sampleRateValue = technicalInfo.sampleRate || currentTrackMeta?.sampleRateHz || 0
    const bitDepthValue = technicalInfo.bitDepth || currentTrackMeta?.bitDepth || 0
    const qualityParts = []
    if (codecText) qualityParts.push(String(codecText).toUpperCase())
    if (bitDepthValue && sampleRateValue) {
      qualityParts.push(`${bitDepthValue}bit / ${Math.round(sampleRateValue / 100) / 10}kHz`)
    } else if (sampleRateValue) {
      qualityParts.push(`${Math.round(sampleRateValue / 100) / 10}kHz`)
    }
    return {
      path: currentTrack.path,
      title: displayMainTitle || stripExtension(currentTrack.name || ''),
      artist: displayMainArtist || '',
      album: displayMainAlbum || '',
      cover: displaySafeCoverUrl || currentTrackMeta?.cover || '',
      duration: displayProgressDuration || duration || currentTrackMeta?.duration || 0,
      codec: codecText || '',
      sampleRateHz: sampleRateValue || 0,
      bitDepth: bitDepthValue || 0,
      bitrateKbps:
        (technicalInfo.bitrate ? Math.round(technicalInfo.bitrate / 1000) : 0) ||
        currentTrackMeta?.bitrateKbps ||
        0,
      qualityText: qualityParts.join(' · ')
    }
  }, [
    currentTrack,
    currentTrackMeta,
    displayMainAlbum,
    displayMainArtist,
    displayMainTitle,
    displayProgressDuration,
    displaySafeCoverUrl,
    duration,
    technicalInfo.bitDepth,
    technicalInfo.bitrate,
    technicalInfo.codec,
    technicalInfo.sampleRate
  ])

  const phoneRemoteStateRef = useRef(null)
  const phoneRemoteEnabled = config.phoneRemoteEnabled === true
  const phoneRemoteClientCount = Array.isArray(phoneRemoteStatus?.clients)
    ? phoneRemoteStatus.clients.length
    : 0
  const phoneRemoteShouldSyncState = phoneRemoteEnabled && phoneRemoteClientCount > 0
  const phoneRemotePathToTrack = useMemo(() => {
    if (!phoneRemoteShouldSyncState) return null
    return new Map(playlist.map((track) => [track.path, track]))
  }, [phoneRemoteShouldSyncState, playlist])

  const applyEqPreset = useCallback((presetName) => {
    const name = String(presetName || '').trim()
    if (!Object.prototype.hasOwnProperty.call(EQ_PRESETS, name)) return
    const preset = EQ_PRESETS[name]
    if (!preset) {
      setConfig((prev) => ({ ...prev, activePreset: name }))
      return
    }
    setEqSoloBandIdx(null)
    setConfig((prev) => ({
      ...prev,
      useEQ: true,
      activePreset: name,
      preamp: preset.preamp ?? prev.preamp,
      eqBands: prev.eqBands?.map((band, index) => ({
        ...band,
        gain: preset.bands[index] ?? band.gain
      }))
    }))
  }, [])

  const refreshPhoneRemoteStatus = useCallback(async () => {
    if (!window.api?.phoneRemote?.status) return null
    try {
      const result = await window.api.phoneRemote.status()
      setPhoneRemoteStatus(result)
      return result
    } catch (error) {
      setPhoneRemoteStatus({ ok: false, lastError: error?.message || String(error) })
      return null
    }
  }, [])

  const startPhoneRemoteServer = useCallback(async (sourceConfig = configRef.current) => {
    if (!window.api?.phoneRemote?.start) return null
    const result = await window.api.phoneRemote.start({
      port: sourceConfig?.phoneRemotePort || 18888,
      allowNoToken: sourceConfig?.phoneRemoteAllowNoToken === true
    })
    setPhoneRemoteStatus(result)
    return result
  }, [])

  const stopPhoneRemoteServer = useCallback(async () => {
    if (!window.api?.phoneRemote?.stop) return null
    const result = await window.api.phoneRemote.stop()
    setPhoneRemoteStatus(result)
    return result
  }, [])

  const handlePhoneRemoteStart = useCallback(async () => {
    setPhoneRemoteBusy(true)
    try {
      const nextConfig = { ...configRef.current, phoneRemoteEnabled: true }
      setConfig((prev) => ({ ...prev, phoneRemoteEnabled: true }))
      await startPhoneRemoteServer(nextConfig)
    } finally {
      setPhoneRemoteBusy(false)
    }
  }, [startPhoneRemoteServer])

  const handlePhoneRemoteStop = useCallback(async () => {
    setPhoneRemoteBusy(true)
    try {
      setConfig((prev) => ({ ...prev, phoneRemoteEnabled: false }))
      await stopPhoneRemoteServer()
    } finally {
      setPhoneRemoteBusy(false)
    }
  }, [stopPhoneRemoteServer])

  const handlePhoneRemoteRotateToken = useCallback(async () => {
    if (!window.api?.phoneRemote?.rotateToken) return
    setPhoneRemoteBusy(true)
    try {
      const result = await window.api.phoneRemote.rotateToken()
      setPhoneRemoteStatus(result)
    } finally {
      setPhoneRemoteBusy(false)
    }
  }, [])

  const handlePhoneRemoteKickClient = useCallback(async (clientId) => {
    if (!window.api?.phoneRemote?.kickClient) return
    const result = await window.api.phoneRemote.kickClient(clientId)
    setPhoneRemoteStatus(result)
  }, [])

  const updatePhoneRemoteConfig = useCallback((patch) => {
    setConfig((prev) => ({ ...prev, ...(patch || {}) }))
  }, [])

  useEffect(() => {
    if (!window.api?.phoneRemote) return undefined
    let cancelled = false
    ;(async () => {
      const result = config.phoneRemoteEnabled
        ? await startPhoneRemoteServer(config)
        : await stopPhoneRemoteServer()
      if (!cancelled && result) setPhoneRemoteStatus(result)
    })()
    return () => {
      cancelled = true
    }
  }, [
    config.phoneRemoteAllowNoToken,
    config.phoneRemoteEnabled,
    config.phoneRemotePort,
    startPhoneRemoteServer,
    stopPhoneRemoteServer
  ])

  useEffect(() => {
    if (!phoneRemoteDrawerOpen) return undefined
    refreshPhoneRemoteStatus()
    const timer = window.setInterval(refreshPhoneRemoteStatus, 2000)
    return () => window.clearInterval(timer)
  }, [phoneRemoteDrawerOpen, refreshPhoneRemoteStatus])

  useEffect(() => {
    if (!phoneRemoteEnabled) return undefined
    refreshPhoneRemoteStatus()
    const timer = window.setInterval(refreshPhoneRemoteStatus, 3000)
    return () => window.clearInterval(timer)
  }, [phoneRemoteEnabled, refreshPhoneRemoteStatus])

  const phoneRemoteSnapshot = useMemo(() => {
    if (!phoneRemoteShouldSyncState) {
      phoneRemoteTrackIdMapRef.current = new Map()
      return null
    }

    const activeLine = Array.isArray(lyrics) ? lyrics[activeLyricIndex] : null
    const prevLine = Array.isArray(lyrics) ? lyrics[activeLyricIndex - 1] : null
    const nextLine = Array.isArray(lyrics) ? lyrics[activeLyricIndex + 1] : null
    const remoteTrackMap = new Map()
    const registerRemoteTrack = (path) => {
      if (!path) return ''
      const id = makePhoneRemoteTrackId(path)
      remoteTrackMap.set(id, path)
      return id
    }
    const pathToTrack = phoneRemotePathToTrack || new Map()
    const buildRemoteTrack = (track, extra = {}) => {
      if (!track?.path) return null
      return buildPhoneRemoteTrackPayload(
        track,
        effectiveTrackMetaMap[track.path] || trackMetaMap[track.path] || null,
        registerRemoteTrack(track.path),
        extra
      )
    }
    const queueItems = []
    if (currentTrack?.path) {
      const item = buildRemoteTrack(currentTrack, {
        cover: displaySafeCoverUrl,
        isCurrent: true
      })
      if (item) queueItems.push(item)
    }
    for (const item of upNextQueue) {
      const track = pathToTrack.get(item?.path)
      if (!track || track.path === currentTrack?.path) continue
      const queueItem = buildRemoteTrack(track, { isCurrent: false })
      if (queueItem) queueItems.push(queueItem)
    }
    const searchResults = phoneRemoteSearchResults
      .map((path) => pathToTrack.get(path))
      .filter(Boolean)
      .map((track) => buildRemoteTrack(track))
      .filter(Boolean)
    const explicitLibraryPaths = Array.isArray(phoneRemoteLibraryView.paths)
      ? phoneRemoteLibraryView.paths
      : []
    const hasExplicitLibraryView =
      explicitLibraryPaths.length > 0 ||
      !!phoneRemoteLibraryView.query ||
      Number(phoneRemoteLibraryView.total) > 0 ||
      Number(phoneRemoteLibraryView.offset) > 0
    const libraryPaths = hasExplicitLibraryView
      ? explicitLibraryPaths
      : playlist.slice(0, 80).map((track) => track.path)
    const libraryResults = libraryPaths
      .map((path) => pathToTrack.get(path))
      .filter(Boolean)
      .map((track) => buildRemoteTrack(track, { cover: '' }))
      .filter(Boolean)
    const libraryTotal = hasExplicitLibraryView
      ? Math.max(0, Number(phoneRemoteLibraryView.total) || 0)
      : playlist.length
    phoneRemoteTrackIdMapRef.current = remoteTrackMap
    const codecText =
      technicalInfo.codec ||
      currentTrackMeta?.codec ||
      (currentTrack?.name ? currentTrack.name.split('.').pop() : '')
    const sampleRateValue = technicalInfo.sampleRate || currentTrackMeta?.sampleRateHz || 0
    const bitDepthValue = technicalInfo.bitDepth || currentTrackMeta?.bitDepth || 0
    const qualityParts = []
    if (codecText) qualityParts.push(String(codecText).toUpperCase())
    if (bitDepthValue && sampleRateValue) {
      qualityParts.push(`${bitDepthValue}bit / ${Math.round(sampleRateValue / 100) / 10}kHz`)
    } else if (sampleRateValue) {
      qualityParts.push(`${Math.round(sampleRateValue / 100) / 10}kHz`)
    }
    qualityParts.push(useNativeEngine ? (isAudioExclusive ? 'Exclusive' : 'Native') : 'WebAudio')
    const activeDevice = audioDevices.find(
      (device) => String(device?.id || '') === String(config.audioDeviceId || '')
    )
    return {
      track: {
        id: isCastSessionActive(lastCastStatus)
          ? lastCastStatus?.castKind || 'cast'
          : currentTrack?.path
            ? 'local-current'
            : '',
        title: displayMainTitle || '',
        artist: displayMainArtist || '',
        album: displayMainAlbum || '',
        cover: sanitizeCoverForPhoneRemote(displaySafeCoverUrl),
        liked: !!(currentTrack?.path && likedSet.has(currentTrack.path)),
        qualityText: qualityParts.filter(Boolean).join(' · ')
      },
      playback: {
        isPlaying: transportIsPlaying === true,
        position: displayProgressTime || 0,
        duration: displayProgressDuration || 0,
        playbackRate,
        volume,
        isMuted: volume <= 0.001,
        playMode
      },
      lyrics: {
        prev: prevLine?.text || '',
        current: activeLine?.text || '',
        next: nextLine?.text || '',
        index: activeLyricIndex
      },
      queue: queueItems,
      search: {
        query: phoneRemoteSearchQuery,
        results: searchResults
      },
      library: {
        query: phoneRemoteLibraryView.query || '',
        offset: Number(phoneRemoteLibraryView.offset) || 0,
        total: libraryTotal,
        results: libraryResults,
        hasMore: (Number(phoneRemoteLibraryView.offset) || 0) + libraryResults.length < libraryTotal
      },
      controls: {
        libraryCount: playlist.length,
        useNativeEngine,
        audioExclusive: config.audioExclusive === true || isAudioExclusive === true,
        gaplessEnabled: config.gaplessEnabled === true,
        automixEnabled: config.crossfadeEnabled === true,
        desktopLyricsEnabled: config.desktopLyricsEnabled === true,
        useEQ: config.useEQ === true,
        activePreset: config.activePreset || 'Custom',
        eqPresets: Object.keys(EQ_PRESETS),
        outputDeviceId: config.audioDeviceId || '',
        outputDeviceName: activeDevice?.name || activeDevice?.label || '系统默认',
        outputDevices: [
          { id: '', name: '系统默认', isDefault: true },
          ...audioDevices.map((device) => ({
            id: String(device?.id || ''),
            name: String(device?.name || device?.label || device?.id || 'Unknown device'),
            isDefault: device?.isDefault === true
          }))
        ]
      }
    }
  }, [
    activeLyricIndex,
    audioDevices,
    config.activePreset,
    config.audioDeviceId,
    config.audioExclusive,
    config.crossfadeEnabled,
    config.desktopLyricsEnabled,
    config.gaplessEnabled,
    config.phoneRemoteEnabled,
    config.useEQ,
    currentTrack?.path,
    currentTrack,
    currentTrackMeta,
    displayMainAlbum,
    displayMainArtist,
    displayMainTitle,
    displayProgressDuration,
    displayProgressTime,
    displaySafeCoverUrl,
    effectiveTrackMetaMap,
    isAudioExclusive,
    lastCastStatus,
    likedSet,
    lyrics,
    playMode,
    playbackRate,
    phoneRemoteShouldSyncState,
    phoneRemoteEnabled,
    phoneRemotePathToTrack,
    phoneRemoteSearchQuery,
    phoneRemoteSearchResults,
    phoneRemoteLibraryView,
    playlist,
    technicalInfo.bitDepth,
    technicalInfo.codec,
    technicalInfo.sampleRate,
    trackMetaMap,
    transportIsPlaying,
    upNextQueue,
    useNativeEngine,
    volume
  ])

  useEffect(() => {
    phoneRemoteStateRef.current = phoneRemoteSnapshot
  }, [phoneRemoteSnapshot])

  useEffect(() => {
    if (!phoneRemoteShouldSyncState || !window.api?.phoneRemote?.updateState) return undefined
    const pushPhoneRemoteState = () => {
      const snapshot = phoneRemoteStateRef.current
      if (!snapshot) return
      window.api.phoneRemote.updateState(snapshot).catch(() => {})
    }
    pushPhoneRemoteState()
    const timer = window.setInterval(() => {
      pushPhoneRemoteState()
    }, 500)
    return () => window.clearInterval(timer)
  }, [phoneRemoteShouldSyncState])

  useEffect(() => {
    if (!window.api?.phoneRemote?.onCommand) return undefined
    return window.api.phoneRemote.onCommand(async (message) => {
      const command = String(message?.command || '')
      const payload = message?.payload || {}
      if (command === 'togglePlay') {
        await togglePlay()
        return
      }
      if (command === 'play') {
        if (!transportIsPlaying) await togglePlay()
        return
      }
      if (command === 'pause') {
        if (transportIsPlaying) await togglePlay()
        return
      }
      if (command === 'next') {
        handleNext()
        return
      }
      if (command === 'previous') {
        handlePrev()
        return
      }
      if (command === 'seek') {
        seekToPosition(payload.position)
        return
      }
      if (command === 'setVolume') {
        setVolume(clampVolume(payload.volume))
        return
      }
      if (command === 'toggleMute') {
        if (volume > 0.001) {
          remotePreviousVolumeRef.current = volume
          setVolume(0)
        } else {
          setVolume(clampVolume(remotePreviousVolumeRef.current || 0.7))
        }
        return
      }
      if (command === 'setPlaybackRate') {
        const nextRate = Math.max(0.5, Math.min(2, Number(payload.rate) || 1))
        setPlaybackRate(nextRate)
        return
      }
      if (command === 'cyclePlayMode') {
        setPlayMode((prev) =>
          prev === 'loop' ? 'shuffle' : prev === 'shuffle' ? 'single' : 'loop'
        )
        return
      }
      if (command === 'setPlayMode') {
        const mode = String(payload.mode || '')
        if (['loop', 'shuffle', 'single'].includes(mode)) setPlayMode(mode)
        return
      }
      if (command === 'toggleLike') {
        if (currentTrack?.path) toggleLike(currentTrack.path)
        return
      }
      if (command === 'setEqPreset') {
        applyEqPreset(payload.preset)
        return
      }
      if (command === 'setEqEnabled') {
        setConfig((prev) => ({ ...prev, useEQ: payload.enabled === true }))
        return
      }
      if (command === 'toggleLyricsView') {
        setShowLyrics((prev) => !prev)
        return
      }
      if (command === 'setDesktopLyrics') {
        setConfig((prev) => ({ ...prev, desktopLyricsEnabled: payload.enabled === true }))
        return
      }
      if (command === 'setGapless') {
        setConfig((prev) => ({
          ...prev,
          gaplessEnabled: payload.enabled === true,
          crossfadeEnabled: payload.enabled === true ? false : prev.crossfadeEnabled
        }))
        return
      }
      if (command === 'setAutomix') {
        setConfig((prev) => ({
          ...prev,
          crossfadeEnabled: payload.enabled === true,
          gaplessEnabled: payload.enabled === true ? false : prev.gaplessEnabled
        }))
        return
      }
      if (command === 'setExclusive') {
        setConfig((prev) => ({ ...prev, audioExclusive: payload.enabled === true }))
        return
      }
      if (command === 'setOutputDevice') {
        const nextId = String(payload.id || '')
        setConfig((prev) => ({ ...prev, audioDeviceId: nextId }))
        if (window.api?.setAudioDevice) window.api.setAudioDevice(nextId).catch(() => {})
        return
      }
      if (command === 'browseTracks') {
        const query = String(payload.query || '').trim()
        const offset = Math.max(0, Math.floor(Number(payload.offset) || 0))
        const limit = Math.max(20, Math.min(120, Math.floor(Number(payload.limit) || 80)))
        const append = payload.append === true
        const hasQuery = query.length > 0
        const sourceTracks = Array.isArray(playlistRef.current) ? playlistRef.current : []
        const matches = []
        sourceTracks.forEach((track, index) => {
          if (!track?.path) return
          const meta = trackMetaMapRef.current?.[track.path] || null
          const parsedInfo = parseTrackInfo(track, meta)
          const title =
            parsedInfo?.title ||
            track?.info?.title ||
            stripExtension(track.name || fileNameFromPath(track.path))
          const artist = parsedInfo?.artist || track?.info?.artist || ''
          const album = parsedInfo?.album || track?.info?.album || ''
          const fileName =
            parsedInfo?.fileName ||
            track?.info?.fileName ||
            stripExtension(track.name || fileNameFromPath(track.path))
          const searchTrack = {
            ...track,
            info: { ...track.info, ...parsedInfo, title, artist, album, fileName }
          }
          const searchScore = hasQuery ? getTrackSearchScore(searchTrack, query) : 1
          if (hasQuery && searchScore <= 0) return
          const score = hasQuery
            ? searchScore + Math.max(0, sourceTracks.length - index) / 100000
            : sourceTracks.length - index
          matches.push({ path: track.path, score })
        })
        const sortedPaths = hasQuery
          ? matches.sort((a, b) => b.score - a.score).map((item) => item.path)
          : matches.map((item) => item.path)
        const nextPaths = sortedPaths.slice(offset, offset + limit)
        setPhoneRemoteLibraryView((prev) => ({
          query,
          offset: append ? Math.max(0, Number(prev?.offset) || 0) : offset,
          total: sortedPaths.length,
          paths: append
            ? [...(Array.isArray(prev?.paths) ? prev.paths : []), ...nextPaths]
            : nextPaths
        }))
        return
      }
      if (command === 'searchTracks') {
        const query = String(payload.query || '').trim()
        setPhoneRemoteSearchQuery(query)
        if (!query) {
          setPhoneRemoteSearchResults([])
          return
        }
        const scored = []
        const sourceTracks = Array.isArray(playlistRef.current) ? playlistRef.current : []
        sourceTracks.forEach((track, index) => {
          if (!track?.path) return
          const meta = trackMetaMapRef.current?.[track.path] || null
          const parsedInfo = parseTrackInfo(track, meta)
          const title =
            parsedInfo?.title ||
            track?.info?.title ||
            stripExtension(track.name || fileNameFromPath(track.path))
          const artist = parsedInfo?.artist || track?.info?.artist || ''
          const album = parsedInfo?.album || track?.info?.album || ''
          const fileName =
            parsedInfo?.fileName ||
            track?.info?.fileName ||
            stripExtension(track.name || fileNameFromPath(track.path))
          const searchTrack = {
            ...track,
            info: { ...track.info, ...parsedInfo, title, artist, album, fileName }
          }
          const score = getTrackSearchScore(searchTrack, query)
          if (score <= 0) return
          scored.push({ path: track.path, score: score + Math.max(0, 100000 - index) / 100000 })
        })
        setPhoneRemoteSearchResults(
          scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 30)
            .map((item) => item.path)
        )
        return
      }
      const remotePath =
        phoneRemoteTrackIdMapRef.current.get(String(payload.id || '')) ||
        (playlistRef.current.some((track) => track?.path === payload.path) ? payload.path : '')
      const remoteTrack = remotePath
        ? playlistRef.current.find((track) => track?.path === remotePath)
        : null
      if (command === 'playTrack' || command === 'playQueueItem') {
        if (!remoteTrack?.path) return
        const trackIndex = playlistRef.current.findIndex(
          (track) => track?.path === remoteTrack.path
        )
        if (trackIndex === -1) return
        setCurrentIndex(trackIndex)
        setIsPlaying(true)
        if (command === 'playQueueItem') {
          setQueuePlaybackEnabled(true)
          setUpNextQueue((prev) => {
            const queueIndex = prev.findIndex((item) => item?.path === remoteTrack.path)
            return queueIndex === -1 ? prev : prev.slice(queueIndex + 1)
          })
        } else {
          setQueuePlaybackEnabled(false)
        }
        return
      }
      if (command === 'queueTrack') {
        if (!remoteTrack?.path) return
        setUpNextQueue((prev) =>
          prev.some((item) => item?.path === remoteTrack.path)
            ? prev
            : [...prev, { path: remoteTrack.path }]
        )
        return
      }
      if (command === 'playNext') {
        if (!remoteTrack?.path) return
        setUpNextQueue((prev) => [
          { path: remoteTrack.path },
          ...prev.filter((item) => item?.path !== remoteTrack.path)
        ])
        return
      }
      if (command === 'removeQueueItem') {
        if (!remoteTrack?.path) return
        setUpNextQueue((prev) => prev.filter((item) => item?.path !== remoteTrack.path))
        return
      }
      if (command === 'clearQueue') {
        setUpNextQueue([])
        return
      }
    })
  }, [
    applyEqPreset,
    currentTrack?.path,
    handleNext,
    handlePrev,
    seekToPosition,
    toggleLike,
    togglePlay,
    transportIsPlaying,
    volume
  ])

  const miniPlayerProgressBucket = Math.floor(
    Math.max(0, Number(displayProgressTime) || 0) / MINI_PLAYER_PROGRESS_SYNC_BUCKET_SEC
  )
  const miniPlayerPayload = useMemo(
    () =>
      buildMiniPlayerPayload({
        trackPath: currentTrack?.path || '',
        title: displayMainTitle || '',
        artist: displayMainArtist || '',
        album: displayMainAlbum || '',
        cover: displaySafeCoverUrl || currentTrackMeta?.cover || '',
        isPlaying: transportIsPlaying === true,
        volume,
        liked: !!(currentTrack?.path && likedSet.has(currentTrack.path)),
        position: displayProgressTime || 0,
        duration: displayProgressDuration || 0,
        updatedAtMs: Date.now()
      }),
    [
      currentTrack?.path,
      currentTrackMeta?.cover,
      displayMainAlbum,
      displayMainArtist,
      displayMainTitle,
      displayProgressDuration,
      displaySafeCoverUrl,
      likedSet,
      miniPlayerProgressBucket,
      transportIsPlaying,
      volume
    ]
  )
  const miniPlayerStateRef = useRef(miniPlayerPayload)
  const [miniPlayerWindowOpen, setMiniPlayerWindowOpen] = useState(false)
  // Remember the showLyrics state at the moment the mini player was opened, so
  // we can restore it after the mini player is closed. We auto-switch to the
  // lyrics view while the mini player is up because it skips the heavy
  // library/track-list DOM and the wallpaper + backdrop-filter stack on the
  // main panel — that combo is what drives main-window CPU into the 30%+ range.
  const showLyricsBeforeMiniPlayerRef = useRef(null)

  useEffect(() => {
    miniPlayerWindowOpenRef.current = miniPlayerWindowOpen
  }, [miniPlayerWindowOpen])

  // Tag <html> while the mini player is active so CSS can pause expensive
  // animations and trim backdrop blur on the main window.
  useEffect(() => {
    const root = document.documentElement
    if (miniPlayerWindowOpen) {
      root.dataset.echoMiniPlayerActive = 'true'
    } else {
      delete root.dataset.echoMiniPlayerActive
    }
    return () => {
      delete root.dataset.echoMiniPlayerActive
    }
  }, [miniPlayerWindowOpen])

  useEffect(() => {
    miniPlayerStateRef.current = miniPlayerPayload
  }, [miniPlayerPayload])

  useEffect(() => {
    if (!miniPlayerWindowOpen) return
    const syncResult = window.api?.updateMiniPlayerData?.(miniPlayerPayload)
    syncResult?.then?.((result) => {
      if (result?.error === 'no_window') setMiniPlayerWindowOpen(false)
    })
    syncResult?.catch?.((error) => {
      console.error('[mini player sync]', error)
    })
  }, [miniPlayerPayload, miniPlayerWindowOpen])

  useEffect(() => {
    window.__getMiniPlayerPayload = () => miniPlayerStateRef.current
    return () => {
      try {
        delete window.__getMiniPlayerPayload
      } catch {
        /* ignore */
      }
    }
  }, [])

  const handleMiniPlayerCommand = useCallback(
    async (message) => {
      const command = String(message?.command || '')
      const payload = message?.payload || {}
      if (command === 'togglePlay') {
        await togglePlay()
        return
      }
      if (command === 'next') {
        handleNext()
        return
      }
      if (command === 'previous') {
        handlePrev()
        return
      }
      if (command === 'setVolume') {
        setVolume(clampVolume(payload.volume))
        return
      }
      if (command === 'toggleLike') {
        if (currentTrack?.path) toggleLike(currentTrack.path)
      }
    },
    [currentTrack?.path, handleNext, handlePrev, toggleLike, togglePlay]
  )

  useEffect(() => {
    if (!window.api?.onMiniPlayerCommand) return undefined
    return window.api.onMiniPlayerCommand(handleMiniPlayerCommand)
  }, [handleMiniPlayerCommand])

  useEffect(() => {
    if (!window.api?.onMiniPlayerClosed) return undefined
    return window.api.onMiniPlayerClosed(() => {
      setMiniPlayerWindowOpen(false)
      // Restore whatever lyrics-view state the user had before opening
      // the mini player. If they were in the library view, drop back to it.
      const previous = showLyricsBeforeMiniPlayerRef.current
      if (previous !== null) {
        setShowLyrics(previous)
        showLyricsBeforeMiniPlayerRef.current = null
      }
    })
  }, [])

  const openMiniPlayer = useCallback(async () => {
    try {
      if (!window.api?.openMiniPlayer) {
        console.warn('[mini player open] desktop window API is unavailable')
        return
      }
      const result = await window.api.openMiniPlayer()
      if (result?.ok === false) {
        console.warn('[mini player open]', result?.error || 'open_failed')
        return
      }
      setMiniPlayerWindowOpen(true)
      // Auto-switch the main window to the lyrics view while the mini player
      // is open — the lyrics surface skips the library list, wallpaper layer
      // and large glass-panel blur stack, dropping main-window CPU
      // dramatically when the user is driving playback from the mini player.
      if (showLyricsBeforeMiniPlayerRef.current === null) {
        showLyricsBeforeMiniPlayerRef.current = showLyrics === true
      }
      if (showLyrics !== true && view === 'player') {
        setShowLyrics(true)
      }
      await window.api?.updateMiniPlayerData?.(miniPlayerStateRef.current)
      await window.api?.setMiniPlayerAlwaysOnTop?.(
        configRef.current.miniPlayerAlwaysOnTop !== false
      )
    } catch (error) {
      console.error('[mini player open]', error)
    }
  }, [showLyrics, view])

  useEffect(() => {
    if (!window.api?.setMiniPlayerAlwaysOnTop) return
    window.api.setMiniPlayerAlwaysOnTop(config.miniPlayerAlwaysOnTop !== false).catch((error) => {
      console.error('[mini player always on top]', error)
    })
  }, [config.miniPlayerAlwaysOnTop])

  useEffect(() => {
    if (!showLyrics || config.lyricsWordHighlight === false) {
      setLyricsRenderTime(getLiveLyricsPlaybackTime())
      return
    }

    if (!transportIsPlaying || lyrics.length === 0) {
      setLyricsRenderTime(getLiveLyricsPlaybackTime())
      return
    }

    let rafId = 0
    let lastTickMs = 0
    const tick = (nowMs) => {
      if (!lastTickMs || nowMs - lastTickMs >= LYRICS_RENDER_TICK_MS) {
        lastTickMs = nowMs
        setLyricsRenderTime(getLiveLyricsPlaybackTime())
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [
    showLyrics,
    config.lyricsWordHighlight,
    transportIsPlaying,
    getLiveLyricsPlaybackTime,
    lyrics.length
  ])

  useEffect(() => {
    const syncActiveLyricIndex = () => {
      const nextIndex = getActiveLyricIndex(
        lyricsRef.current,
        getLiveLyricsPlaybackTime(),
        configRef.current.lyricsOffsetMs
      )
      if (nextIndex === activeLyricIndexRef.current) return
      activeLyricIndexRef.current = nextIndex
      setActiveLyricIndex(nextIndex)
    }

    syncActiveLyricIndex()
    if (!transportIsPlaying || lyricsRef.current.length === 0) return undefined
    // 主界面(无沉浸歌词、无桌面歌词)时,activeLyricIndex 不参与渲染,
    // 没必要每帧唤醒主线程做对齐计算 — timeupdate 事件回调那条路径仍然会维护它。
    if (!lyricsTimingSurfaceActive) return undefined

    // 直接用 setInterval 即可: ACTIVE_LYRIC_SYNC_TICK_MS = 100ms,
    // 用 RAF 每帧唤醒只为了 100ms 才做一次工作,纯粹浪费 CPU。
    const id = window.setInterval(syncActiveLyricIndex, ACTIVE_LYRIC_SYNC_TICK_MS)
    return () => window.clearInterval(id)
  }, [
    config.lyricsOffsetMs,
    currentTrackPath,
    getLiveLyricsPlaybackTime,
    lyrics,
    lyricsTimingSurfaceActive,
    transportIsPlaying
  ])

  const lyricTimelineValid = useMemo(() => {
    if (!Array.isArray(lyrics) || lyrics.length < 2) return false

    let firstTime = null
    let lastTime = null
    let prevTime = null
    let positiveGapCount = 0
    let nearPlainGapCount = 0

    for (const line of lyrics) {
      const t = Number(line?.time)
      if (!Number.isFinite(t)) continue

      if (firstTime == null) firstTime = t
      if (lastTime == null || t > lastTime) lastTime = t

      if (prevTime != null) {
        const gap = t - prevTime
        if (gap < -1e-3) return false
        if (gap > 1e-3) {
          positiveGapCount += 1
          if (Math.abs(gap - 3.5) < 0.03) nearPlainGapCount += 1
        }
      }
      prevTime = t
    }

    if (firstTime == null || lastTime == null || positiveGapCount < 1) return false

    const span = lastTime - firstTime
    if (!Number.isFinite(span) || span <= 0.2) return false

    if (positiveGapCount >= 4 && nearPlainGapCount / positiveGapCount > 0.75) return false

    if (
      Number.isFinite(displayProgressDuration) &&
      displayProgressDuration > 0 &&
      span > Math.max(displayProgressDuration * 1.5, displayProgressDuration + 45)
    ) {
      return false
    }

    return true
  }, [lyrics, displayProgressDuration])

  const lyricKaraokeStateList = useMemo(() => {
    if (!Array.isArray(lyrics) || lyrics.length === 0) return []
    if (!lyricTimelineValid) return lyrics.map(() => null)
    const fromIndex = Math.max(0, activeLyricIndex - KARAOKE_RENDER_CONTEXT_LINES)
    const toIndex = Math.min(lyrics.length - 1, activeLyricIndex + KARAOKE_RENDER_CONTEXT_LINES)

    return lyrics.map((line, idx) => {
      if (idx < fromIndex || idx > toIndex) return null
      return buildLyricKaraokeState({
        line,
        nextLine: lyrics[idx + 1],
        positionSec: lyricsRenderTime,
        durationSec: displayProgressDuration,
        offsetMs: config.lyricsOffsetMs,
        leadMs: config.lyricsWordLeadMs,
        fillRatio: config.lyricsWordFillRatio
      })
    })
  }, [
    lyrics,
    lyricTimelineValid,
    activeLyricIndex,
    lyricsRenderTime,
    displayProgressDuration,
    config.lyricsOffsetMs,
    config.lyricsWordLeadMs,
    config.lyricsWordFillRatio
  ])

  const lyricsStatusUi = useMemo(() => {
    if (isCurrentTrackLyricsInstrumental)
      return { tone: 'idle', text: t('lyricsDrawer.statusInstrumental') }
    if (lyricsMatchStatus === 'loading')
      return { tone: 'pending', text: t('lyricsDrawer.statusLoading') }
    if (lyricsMatchStatus === 'none') return { tone: 'bad', text: t('lyricsDrawer.statusNone') }
    if (
      lyricsMatchStatus === 'matched' &&
      config.lyricsWordHighlight !== false &&
      !lyricTimelineValid
    ) {
      return { tone: 'warn', text: t('lyricsDrawer.statusDegraded') }
    }
    if (lyricsMatchStatus === 'matched')
      return { tone: 'ok', text: t('lyricsDrawer.statusMatched') }
    return { tone: 'idle', text: t('lyricsDrawer.statusDash') }
  }, [
    isCurrentTrackLyricsInstrumental,
    lyricsMatchStatus,
    lyricTimelineValid,
    config.lyricsWordHighlight,
    t
  ])

  const selectedLyricsSource = useMemo(() => {
    return (
      getLyricsSourcePreferenceForPath(currentTrackPath) ||
      normalizeLyricsSourcePreference(config.lyricsSource) ||
      DEFAULT_CONFIG.lyricsSource
    )
  }, [currentTrackPath, config.lyricsSource, lyricsSourcePreferenceRevision])

  const lyricsSourceUi = useMemo(() => {
    const labelMap = {
      idle: t('lyricsDrawer.sourceStateIdle', '-'),
      loading: t('lyricsDrawer.sourceStateLoading', 'Loading'),
      none: t('lyricsDrawer.sourceStateNone', 'No lyrics'),
      local: t('lyricsDrawer.sourceStateLocal', 'Local file'),
      embedded: t('lyricsDrawer.sourceStateEmbedded', 'Embedded tags'),
      lrclib: t('lyricsDrawer.sourceStateLrclib', 'LRCLIB'),
      netease: t('lyricsDrawer.sourceStateNetease', 'NetEase'),
      qq: t('lyricsDrawer.sourceStateQq', 'QQ Music'),
      kugou: t('lyricsDrawer.sourceStateKugou', 'Kugou'),
      kuwo: t('lyricsDrawer.sourceStateKuwo', 'Kuwo'),
      streaming: t('lyricsDrawer.sourceStateStreaming', 'Streaming'),
      instrumental: t('lyricsDrawer.sourceStateInstrumental', 'Instrumental'),
      manual: t('lyricsDrawer.sourceStateManual', 'Manual'),
      link: t('lyricsDrawer.sourceStateLink', 'Song link'),
      cache: t('lyricsDrawer.sourceStateCache', 'Cache')
    }
    if (isCurrentTrackLyricsInstrumental) {
      return labelMap.instrumental
    }
    const detail = lyricsSourceStatus?.detail
      ? labelMap[lyricsSourceStatus.detail] || lyricsSourceStatus.detail
      : ''
    const origin = lyricsSourceStatus?.origin
      ? labelMap[lyricsSourceStatus.origin] || lyricsSourceStatus.origin
      : ''

    let text = labelMap[lyricsSourceStatus?.kind] || labelMap.idle
    if (lyricsSourceStatus?.kind === 'none' && lyricsSourceStatus?.detail === 'instrumental') {
      text = labelMap.instrumental
    } else if (lyricsSourceStatus?.kind === 'cache' && detail) {
      text = `${labelMap.cache} -${detail}${origin && origin !== detail ? ` -${origin}` : ''}`
    } else if (
      (lyricsSourceStatus?.kind === 'manual' || lyricsSourceStatus?.kind === 'link') &&
      origin
    ) {
      text = `${text} -${origin}`
    }

    return text
  }, [isCurrentTrackLyricsInstrumental, lyricsSourceStatus, t])

  const preferredReleaseVersion = useMemo(
    () => normalizeReleaseVersion(updateStatus?.version || appVersion),
    [updateStatus, appVersion]
  )

  const visibleReleaseNotes = useMemo(() => {
    if (!Array.isArray(releaseNotes) || releaseNotes.length === 0) return []
    const preferred = preferredReleaseVersion
      ? releaseNotes.find(
          (item) => normalizeReleaseVersion(item.version) === preferredReleaseVersion
        )
      : null
    if (!preferred) return releaseNotes.slice(0, 3)
    return [preferred, ...releaseNotes.filter((item) => item !== preferred).slice(0, 2)]
  }, [releaseNotes, preferredReleaseVersion])

  const customThemeColorFields = useMemo(
    () => [
      {
        key: 'bgColor',
        label: t('customTheme.bg'),
        desc: t('customTheme.bgDesc')
      },
      {
        key: 'accent1',
        label: t('customTheme.accent1'),
        desc: t('customTheme.accent1Desc')
      },
      {
        key: 'accent2',
        label: t('customTheme.accent2'),
        desc: t('customTheme.accent2Desc')
      },
      {
        key: 'accent3',
        label: t('customTheme.accent3'),
        desc: t('customTheme.accent3Desc')
      },
      {
        key: 'textMain',
        label: t('customTheme.textMain'),
        desc: t('customTheme.textMainDesc')
      },
      {
        key: 'textSoft',
        label: t('customTheme.textSoft'),
        desc: t('customTheme.textSoftDesc')
      },
      {
        key: 'glassColor',
        label: t('customTheme.glassColor'),
        desc: t('customTheme.glassColorDesc')
      }
    ],
    [t]
  )

  const parsedPlaylist = useMemo(() => {
    const result = buildParsedPlaylistWithCache(
      parsedPlaylistCacheRef.current,
      playlist,
      trackMetaMap,
      displayMetadataOverrides
    )
    parsedPlaylistCacheRef.current = result.cache
    return result.items
  }, [playlist, trackMetaMap, displayMetadataOverrides])

  const queryFilteredPlaylist = useMemo(() => {
    const localTracks = parsedPlaylist.filter((track) => !isRemoteTrackPath(track.path))
    return filterAndRankTracksBySearch(localTracks, deferredSearchQuery)
  }, [parsedPlaylist, deferredSearchQuery])

  useEffect(() => {
    if (listMode !== 'album') return
    const foundCovers = {}
    const foundCoverItems = []
    for (const track of parsedPlaylist) {
      const albumName = track?.info?.album || 'Singles'
      const cover = track?.info?.cover
      if (albumName && cover && !foundCovers[albumName]) {
        foundCovers[albumName] = cover
        foundCoverItems.push({
          album: albumName,
          artist: track?.info?.artist || '',
          cover
        })
      }
    }
    if (Object.keys(foundCovers).length === 0) return
    persistAlbumCoverCacheItems(foundCoverItems)

    setAlbumCoverMap((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [albumName, cover] of Object.entries(foundCovers)) {
        if (!next[albumName] && cover) {
          next[albumName] = cover
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [listMode, parsedPlaylist, persistAlbumCoverCacheItems])

  const shouldBuildAlbumBuckets = listMode === 'album' || selectedAlbum !== 'all'
  const shouldBuildFolderBuckets = listMode === 'folders' || selectedFolder !== 'all'
  const shouldBuildArtistBuckets = listMode === 'artists' || selectedArtist !== 'all'
  const shouldBuildSmartCollections = listMode === 'playlists' || Boolean(selectedSmartCollectionId)

  const albumArtistByName = useMemo(() => {
    if (listMode !== 'history' && !(listMode === 'album' && selectedAlbum === 'all')) return {}
    const m = {}
    for (const track of queryFilteredPlaylist) {
      const name = track.info.album || 'Singles'
      if (m[name] == null && track.info.artist && track.info.artist !== 'Unknown Artist') {
        m[name] = track.info.artist
      }
    }
    return m
  }, [listMode, queryFilteredPlaylist, selectedAlbum])

  // Build hydration targets for every album in the library, regardless of the
  // currently active view. The album cover cache is reused by the album wall,
  // sidebar album rows, and the "now playing" fallback art, so we want it
  // populated as soon as the library is ready - not lazily on the first switch
  // to the album view (which previously caused a noticeable empty-cover window
  // when reopening the app).
  const albumCoverCacheTargets = useMemo(() => {
    const targetsByAlbum = new Map()
    for (const track of queryFilteredPlaylist) {
      const albumName = String(track?.info?.album || 'Singles').trim() || 'Singles'
      if (!albumName || targetsByAlbum.has(albumName)) continue
      const artist =
        track?.info?.artist && track.info.artist !== 'Unknown Artist' ? track.info.artist : ''
      targetsByAlbum.set(albumName, {
        albumName,
        artist,
        exactKey: createAlbumCoverCacheKey(albumName, artist),
        fallbackKey: createAlbumCoverFallbackKey(albumName)
      })
    }
    return Array.from(targetsByAlbum.values())
  }, [queryFilteredPlaylist])

  useEffect(() => {
    if (!libraryStateReady || albumCoverCacheTargets.length === 0) return undefined
    let cancelled = false

    const hydrateAlbumCoverCache = async () => {
      // Progressive hydration: reading every album key at once can overwhelm
      // IndexedDB when the library is large (thousands of tracks / many albums),
      // causing CPU spikes and long main-thread stalls. Batch the lookups and
      // yield between batches so playback/UI stay responsive.
      const keys = []
      for (const target of albumCoverCacheTargets) {
        if (target.exactKey) keys.push(target.exactKey)
        if (target.fallbackKey) keys.push(target.fallbackKey)
      }
      const uniqueKeys = [...new Set(keys.filter(Boolean))]
      if (uniqueKeys.length === 0) return

      const keyToAlbum = new Map()
      for (const target of albumCoverCacheTargets) {
        if (target.exactKey) keyToAlbum.set(target.exactKey, target.albumName)
        if (target.fallbackKey && !keyToAlbum.has(target.fallbackKey)) {
          keyToAlbum.set(target.fallbackKey, target.albumName)
        }
      }

      const BATCH_KEYS = 220
      const MAX_KEYS_PER_RUN = 1800
      const cappedKeys = uniqueKeys.slice(0, MAX_KEYS_PER_RUN)

      for (let offset = 0; offset < cappedKeys.length; offset += BATCH_KEYS) {
        if (cancelled) return
        const batch = cappedKeys.slice(offset, offset + BATCH_KEYS)
        const cached = await readAlbumCoverCache(batch).catch(() => ({}))
        if (cancelled || Object.keys(cached).length === 0) {
          // Yield anyway; IDB can still be busy even if no entries were found.
          await new Promise((resolve) => setTimeout(resolve, 0))
          continue
        }

        setAlbumCoverMap((prev) => {
          let changed = false
          const next = { ...prev }
          for (const [key, entry] of Object.entries(cached)) {
            if (!entry?.cover) continue
            const albumName = keyToAlbum.get(key)
            if (!albumName || next[albumName]) continue
            next[albumName] = entry.cover
            changed = true
          }
          return changed ? next : prev
        })

        // Let the browser breathe between IDB batches.
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    hydrateAlbumCoverCache()
    return () => {
      cancelled = true
    }
  }, [albumCoverCacheTargets, libraryStateReady])

  const albumNamesSet = useMemo(() => {
    if (selectedAlbum === 'all' || listMode === 'album') return EMPTY_SET
    const s = new Set()
    for (const t of queryFilteredPlaylist) {
      s.add(t.info.album || 'Singles')
    }
    return s
  }, [listMode, queryFilteredPlaylist, selectedAlbum])

  /* Build heavyweight library groupings only for the views that need them. */
  const albumBuckets = useMemo(() => {
    if (!shouldBuildAlbumBuckets) return []
    const groups = queryFilteredPlaylist.reduce((acc, track) => {
      const key = track.info.album || 'Singles'
      if (!acc.has(key)) acc.set(key, [])
      acc.get(key).push(track)
      return acc
    }, new Map())

    const buckets = Array.from(groups.entries()).map(([name, tracks]) => ({
      name,
      tracks,
      artist:
        tracks.find((t) => t.info.artist && t.info.artist !== 'Unknown Artist')?.info.artist ||
        'Unknown Artist',
      cover:
        albumCoverMap[name] ||
        trackMetaMap[tracks.find((t) => trackMetaMap[t.path]?.cover)?.path]?.cover ||
        tracks.find((t) => t.info.cover)?.info.cover ||
        null
    }))

    const getAlbumAddedAt = (album) =>
      Math.min(...album.tracks.map((track) => track.birthtimeMs || Infinity))

    if (albumSortMode === 'dateAsc') {
      buckets.sort((a, b) => getAlbumAddedAt(a) - getAlbumAddedAt(b))
    } else if (albumSortMode === 'dateDesc') {
      buckets.sort((a, b) => getAlbumAddedAt(b) - getAlbumAddedAt(a))
    } else if (albumSortMode === 'nameDesc') {
      buckets.sort((a, b) => b.name.localeCompare(a.name))
    } else if (albumSortMode === 'artistAsc') {
      buckets.sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name))
    } else if (albumSortMode === 'artistDesc') {
      buckets.sort((a, b) => b.artist.localeCompare(a.artist) || a.name.localeCompare(b.name))
    } else if (albumSortMode === 'tracksAsc') {
      buckets.sort((a, b) => a.tracks.length - b.tracks.length || a.name.localeCompare(b.name))
    } else if (albumSortMode === 'tracksDesc') {
      buckets.sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name))
    } else {
      buckets.sort((a, b) => a.name.localeCompare(b.name))
    }

    buckets.sort((a, b) => {
      if (!!a.cover === !!b.cover) return 0
      return a.cover ? -1 : 1
    })

    return buckets
  }, [albumCoverMap, albumSortMode, queryFilteredPlaylist, shouldBuildAlbumBuckets, trackMetaMap])

  const albumGroups = listMode === 'album' ? albumBuckets : []

  const folderTree = useMemo(() => {
    if (!shouldBuildFolderBuckets) return []
    return buildFolderHierarchy(queryFilteredPlaylist, importedFolders, folderSortMode)
  }, [folderSortMode, importedFolders, queryFilteredPlaylist, shouldBuildFolderBuckets])

  const folderBuckets = useMemo(() => flattenFolderHierarchy(folderTree), [folderTree])

  const folderNamesSet = useMemo(() => {
    if (selectedFolder === 'all') return EMPTY_SET
    const s = new Set()
    for (const b of folderBuckets) s.add(b.folderPath)
    return s
  }, [folderBuckets, selectedFolder])

  const folderGroups = listMode === 'folders' ? folderBuckets : []

  const artistBuckets = useMemo(() => {
    if (!shouldBuildArtistBuckets) return []
    const unknownArtist = t('artists.unknown', 'Unknown Artist')
    const buckets = buildArtistBucketsWithAvatars(queryFilteredPlaylist, {
      unknownArtist,
      trackMetaMap,
      albumCoverMap,
      artistAvatarMap
    })

    const getArtistAddedAt = (artist) =>
      Math.min(...artist.tracks.map((track) => track.birthtimeMs || Infinity))

    if (artistSortMode === 'nameAsc') {
      buckets.sort((a, b) => a.name.localeCompare(b.name) || b.tracks.length - a.tracks.length)
    } else if (artistSortMode === 'nameDesc') {
      buckets.sort((a, b) => b.name.localeCompare(a.name) || b.tracks.length - a.tracks.length)
    } else if (artistSortMode === 'tracksAsc') {
      buckets.sort((a, b) => a.tracks.length - b.tracks.length || a.name.localeCompare(b.name))
    } else if (artistSortMode === 'tracksDesc') {
      buckets.sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name))
    } else if (artistSortMode === 'dateAsc') {
      buckets.sort((a, b) => getArtistAddedAt(a) - getArtistAddedAt(b) || a.name.localeCompare(b.name))
    } else if (artistSortMode === 'dateDesc') {
      buckets.sort((a, b) => getArtistAddedAt(b) - getArtistAddedAt(a) || a.name.localeCompare(b.name))
    }

    return buckets
  }, [
    albumCoverMap,
    artistSortMode,
    artistAvatarMap,
    queryFilteredPlaylist,
    shouldBuildArtistBuckets,
    t,
    trackMetaMap
  ])

  const artistNamesSet = useMemo(() => {
    if (selectedArtist === 'all') return EMPTY_SET
    const s = new Set()
    for (const b of artistBuckets) s.add(b.name)
    return s
  }, [artistBuckets, selectedArtist])

  const artistGroups = listMode === 'artists' ? artistBuckets : []

  useEffect(() => {
    if (listMode !== 'artists' || !libraryStateReady || artistBuckets.length === 0) {
      return undefined
    }
    if (!window.api?.fetchArtistAvatarImage) return undefined
    if (!window.api?.neteaseSearchArtist && !window.api?.qqMusicSearchArtist) return undefined

    const targets = artistBuckets
      .filter((artist) => !artist.isUnknownArtist && !artist.hasRemoteAvatar)
      .map((artist) => ({
        name: artist.name,
        key: createArtistAvatarCacheKey(artist.name),
        queries: buildArtistAvatarSearchQueries(artist.name)
      }))
      .filter((target) => target.key && target.queries.length > 0 && !artistAvatarMap[target.name])

    if (targets.length === 0) return undefined
    let cancelled = false

    const writeArtistAvatarMiss = (target) => {
      writeArtistAvatarCache({
        [target.key]: {
          artist: target.name,
          avatarUrl: null,
          source: `miss-v${ARTIST_AVATAR_LOOKUP_VERSION}`,
          checkedAt: Date.now()
        }
      }).catch(() => {})
    }

    const delay = (ms) =>
      new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(0, Number(ms) || 0))
      })

    const waitForArtistAvatarLookupSlot = async (gapMs = ARTIST_AVATAR_LOOKUP_GAP_MS) => {
      const now = Date.now()
      const blockedUntil = Math.max(
        artistAvatarLookupAvailableAtRef.current,
        lastArtistAvatarLookupAtRef.current + gapMs
      )
      const waitMs = blockedUntil - now
      if (waitMs > 0) {
        await delay(waitMs)
      }
      if (cancelled) return false
      lastArtistAvatarLookupAtRef.current = Date.now()
      return true
    }

    const deferArtistAvatarLookup = (target, retryAfterMs = 0) => {
      const waitMs = Math.max(
        ARTIST_AVATAR_TRANSIENT_RETRY_MS,
        getArtistAvatarRetryAfterMs({ retryAfterMs }, 0)
      )
      artistAvatarLookupAvailableAtRef.current = Math.max(
        artistAvatarLookupAvailableAtRef.current,
        Date.now() + waitMs
      )
      artistAvatarAttemptedRef.current.delete(target.key)
      if (artistAvatarRetryTimerRef.current) {
        window.clearTimeout(artistAvatarRetryTimerRef.current)
      }
      artistAvatarRetryTimerRef.current = window.setTimeout(() => {
        artistAvatarRetryTimerRef.current = null
        artistAvatarLookupAvailableAtRef.current = 0
        artistAvatarAttemptedRef.current.delete(target.key)
        setArtistAvatarRetryNonce((value) => value + 1)
      }, waitMs)
    }

    const run = async () => {
      const cached = await readArtistAvatarCache(targets.map((target) => target.key)).catch(
        () => ({})
      )
      if (cancelled) return

      const cachedAvatars = {}
      const unresolved = []
      const now = Date.now()
      const currentAvatarSourceSuffix = `-v${ARTIST_AVATAR_LOOKUP_VERSION}`
      const acceptedAvatarSourceSuffixes = [currentAvatarSourceSuffix, '-v5', '-v4']
      for (const target of targets) {
        const entry = cached[target.key]
        const cachedAvatarUrl = String(entry?.avatarUrl || '').trim()
        const cachedAvatarSource = String(entry?.source || '')
        if (
          cachedAvatarUrl &&
          !cachedAvatarSource.startsWith('miss-') &&
          acceptedAvatarSourceSuffixes.some((suffix) => cachedAvatarSource.endsWith(suffix)) &&
          !isPlatformDefaultArtistAvatarUrl(cachedAvatarUrl)
        ) {
          cachedAvatars[target.name] = cachedAvatarUrl
          artistAvatarAttemptedRef.current.add(target.key)
          continue
        }
        if (
          cachedAvatarSource &&
          cachedAvatarSource !== `miss-v${ARTIST_AVATAR_LOOKUP_VERSION}` &&
          (cachedAvatarSource.startsWith('miss-') ||
            !acceptedAvatarSourceSuffixes.some((suffix) => cachedAvatarSource.endsWith(suffix)))
        ) {
          artistAvatarAttemptedRef.current.delete(target.key)
        }
        if (
          entry?.checkedAt &&
          entry?.source === `miss-v${ARTIST_AVATAR_LOOKUP_VERSION}` &&
          now - Number(entry.checkedAt) < ARTIST_AVATAR_MISS_TTL_MS
        ) {
          artistAvatarAttemptedRef.current.add(target.key)
          continue
        }
        if (!artistAvatarAttemptedRef.current.has(target.key)) {
          unresolved.push(target)
        }
      }

      if (Object.keys(cachedAvatars).length > 0) {
        setArtistAvatarMap((prev) => ({ ...prev, ...cachedAvatars }))
      }
      if (unresolved.length === 0) return

      const queue = unresolved.slice(0, ARTIST_AVATAR_PREFETCH_LIMIT)
      let nextIndex = 0

      const runNext = async () => {
        while (!cancelled) {
          if (artistAvatarLookupAvailableAtRef.current - Date.now() > ARTIST_AVATAR_LOOKUP_GAP_MS) {
            return
          }
          const target = queue[nextIndex]
          nextIndex += 1
          if (!target) return
          artistAvatarAttemptedRef.current.add(target.key)

          try {
            let resolved = null
            let transientFailure = false
            let transientRetryAfterMs = 0
            for (const query of target.queries) {
              const providerAttempts = [
                {
                  source: 'netease',
                  search: window.api.neteaseSearchArtist,
                  pickImageUrl: pickNeteaseArtistImageUrl,
                  filterCandidates: (candidates) =>
                    (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
                      [candidate?.picUrl, candidate?.img1v1Url, candidate?.avatar].some((url) =>
                        normalizeNeteaseArtistImageUrl(url)
                      )
                    )
                },
                {
                  source: 'qq',
                  search: window.api.qqMusicSearchArtist,
                  pickImageUrl: (candidate) =>
                    normalizeQqMusicArtistImageUrl(
                      candidate?.picUrl || candidate?.img1v1Url || candidate?.avatar
                    )
                }
              ].filter((provider) => typeof provider.search === 'function')

              for (const provider of providerAttempts) {
                const canLookup = await waitForArtistAvatarLookupSlot()
                if (!canLookup) return
                const response = await provider.search({ artist: query })
                if (cancelled) return
                const searchResult = normalizeArtistAvatarSearchResponse(response)
                if (searchResult.transient) {
                  transientFailure = true
                  transientRetryAfterMs = Math.max(
                    transientRetryAfterMs,
                    getArtistAvatarRetryAfterMs(searchResult, 0)
                  )
                }
                const candidatePool = provider.filterCandidates
                  ? provider.filterCandidates(searchResult.candidates)
                  : searchResult.candidates
                const best = pickBestArtistAvatarCandidate(candidatePool, target.name, query)
                const avatarUrl = provider.pickImageUrl(best)
                if (!avatarUrl) continue
                const canFetchImage = await waitForArtistAvatarLookupSlot(
                  ARTIST_AVATAR_PROVIDER_GAP_MS
                )
                if (!canFetchImage) return
                const imageResult = await window.api?.fetchArtistAvatarImage?.(avatarUrl)
                if (cancelled) return
                if (isTransientArtistAvatarFailure(imageResult)) {
                  transientFailure = true
                  transientRetryAfterMs = Math.max(
                    transientRetryAfterMs,
                    getArtistAvatarRetryAfterMs(imageResult, 0)
                  )
                }
                const dataUrl = imageResult?.ok && imageResult?.dataUrl ? imageResult.dataUrl : ''
                if (dataUrl) {
                  resolved = { dataUrl, source: provider.source }
                  break
                }
              }
              if (resolved) break
            }

            if (resolved?.dataUrl) {
              setArtistAvatarMap((prev) =>
                prev[target.name] ? prev : { ...prev, [target.name]: resolved.dataUrl }
              )
              writeArtistAvatarCache({
                [target.key]: {
                  artist: target.name,
                  avatarUrl: resolved.dataUrl,
                  source: `${resolved.source}-v${ARTIST_AVATAR_LOOKUP_VERSION}`,
                  checkedAt: Date.now()
                }
              }).catch(() => {})
            } else if (transientFailure) {
              deferArtistAvatarLookup(target, transientRetryAfterMs)
              return
            } else {
              writeArtistAvatarMiss(target)
            }
          } catch (e) {
            deferArtistAvatarLookup(target, getArtistAvatarRetryAfterMs(e, 0))
            return
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(ARTIST_AVATAR_PREFETCH_WORKERS, queue.length) }, () =>
          runNext()
        )
      )
    }

    run()
    return () => {
      cancelled = true
      if (artistAvatarRetryTimerRef.current) {
        window.clearTimeout(artistAvatarRetryTimerRef.current)
        artistAvatarRetryTimerRef.current = null
      }
    }
  }, [artistAvatarMap, artistAvatarRetryNonce, artistBuckets, libraryStateReady, listMode])

  const importedFolderItems = useMemo(() => {
    const seen = new Set()
    return importedFolders
      .map(normalizeImportedFolderPath)
      .filter(Boolean)
      .filter((folderPath) => {
        const key = folderPath.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((folderPath) => ({
        path: folderPath,
        name: getPathBasename(folderPath) || folderPath,
        trackCount: playlist.filter((track) =>
          isTrackInsideImportedFolders(track?.path, [folderPath])
        ).length
      }))
  }, [importedFolders, playlist])

  const frequentSortTrackStats = songSortMode === 'frequentDesc' ? trackStats : null

  const filteredPlaylist = useMemo(() => {
    let result = queryFilteredPlaylist
    if (listMode === 'folders' && selectedFolder !== 'all') {
      result = queryFilteredPlaylist.filter((track) => {
        const parts = (track.path || '').replace(/\\/g, '/').split('/')
        const fp = parts.length > 1 ? parts.slice(0, -1).join('/') : '/'
        return fp === selectedFolder || isTrackInsideImportedFolders(track.path, [selectedFolder])
      })
    } else if (listMode === 'artists' && selectedArtist !== 'all') {
      const pickedArtistTracks = selectedArtistTracksRef.current
      if (
        pickedArtistTracks.name === selectedArtist &&
        pickedArtistTracks.source === queryFilteredPlaylist &&
        pickedArtistTracks.tracks.length > 0
      ) {
        result = [...pickedArtistTracks.tracks].sort(compareTrackOrder)
      } else {
        result = queryFilteredPlaylist
          .filter(
            (track) =>
              (track.info.artist || t('artists.unknown', 'Unknown Artist')) === selectedArtist
          )
          .sort(compareTrackOrder)
      }
    } else if (selectedAlbum !== 'all') {
      result = queryFilteredPlaylist
        .filter((track) => track.info.album === selectedAlbum)
        .sort(compareTrackOrder)
    }

    if (
      listMode === 'songs' ||
      (listMode === 'folders' && selectedFolder !== 'all') ||
      (listMode === 'artists' && selectedArtist !== 'all') ||
      (listMode === 'album' && selectedAlbum !== 'all')
    ) {
      const mode = songSortMode
      if (mode === 'dateAsc') {
        return [...result].sort((a, b) => (a.birthtimeMs || Infinity) - (b.birthtimeMs || Infinity))
      } else if (mode === 'dateDesc') {
        return [...result].sort((a, b) => (b.birthtimeMs || 0) - (a.birthtimeMs || 0))
      } else if (mode === 'nameAsc') {
        return [...result].sort((a, b) => a.info.title.localeCompare(b.info.title))
      } else if (mode === 'nameDesc') {
        return [...result].sort((a, b) => b.info.title.localeCompare(a.info.title))
      } else if (mode === 'durationAsc') {
        return [...result].sort(
          (a, b) => (a.info.duration || Infinity) - (b.info.duration || Infinity)
        )
      } else if (mode === 'durationDesc') {
        return [...result].sort((a, b) => (b.info.duration || 0) - (a.info.duration || 0))
      } else if (mode === 'qualityAsc') {
        return [...result].sort(
          (a, b) => (a.info.sizeBytes || Infinity) - (b.info.sizeBytes || Infinity)
        )
      } else if (mode === 'qualityDesc') {
        return [...result].sort((a, b) => (b.info.sizeBytes || 0) - (a.info.sizeBytes || 0))
      } else if (mode === 'frequentDesc') {
        return [...result].sort((a, b) => compareTrackFrequent(a, b, frequentSortTrackStats || {}))
      } else if (mode === 'random') {
        return [...result].sort((a, b) => compareTrackRandom(a, b, songRandomSortSeed))
      }
    }
    return result
  }, [
    queryFilteredPlaylist,
    selectedAlbum,
    selectedFolder,
    selectedArtist,
    listMode,
    songSortMode,
    songRandomSortSeed,
    frequentSortTrackStats,
    t
  ])

  useEffect(() => {
    if (selectedAlbum === 'all') return
    if (listMode === 'album') return
    if (!albumNamesSet.has(selectedAlbum)) setSelectedAlbum('all')
  }, [albumNamesSet, listMode, selectedAlbum])

  useEffect(() => {
    if (selectedFolder === 'all') return
    if (importedFolderItems.some((folder) => folder.path === selectedFolder)) return
    if (!folderNamesSet.has(selectedFolder)) setSelectedFolder('all')
  }, [folderNamesSet, importedFolderItems, selectedFolder])

  useEffect(() => {
    if (selectedArtist === 'all') return
    if (listMode === 'artists') return
    if (!artistNamesSet.has(selectedArtist)) setSelectedArtist('all')
  }, [artistNamesSet, listMode, selectedArtist])

  const selectedUserPlaylist = useMemo(
    () => userPlaylists.find((p) => p.id === selectedUserPlaylistId) || null,
    [userPlaylists, selectedUserPlaylistId]
  )

  const recentPlayedTracks = useMemo(() => {
    if (!shouldBuildSmartCollections) return []
    return parsedPlaylist
      .filter((track) => Number(trackStats[track.path]?.lastPlayedAt) > 0)
      .sort((a, b) => {
        const diff =
          Number(trackStats[b.path]?.lastPlayedAt || 0) -
          Number(trackStats[a.path]?.lastPlayedAt || 0)
        if (diff !== 0) return diff
        return a.info.title.localeCompare(b.info.title)
      })
  }, [parsedPlaylist, shouldBuildSmartCollections, trackStats])

  const mostPlayedTracks = useMemo(() => {
    if (!shouldBuildSmartCollections) return []
    return parsedPlaylist
      .filter((track) => Number(trackStats[track.path]?.playCount) > 0)
      .sort((a, b) => {
        const playDiff =
          Number(trackStats[b.path]?.playCount || 0) - Number(trackStats[a.path]?.playCount || 0)
        if (playDiff !== 0) return playDiff
        const recentDiff =
          Number(trackStats[b.path]?.lastPlayedAt || 0) -
          Number(trackStats[a.path]?.lastPlayedAt || 0)
        if (recentDiff !== 0) return recentDiff
        return a.info.title.localeCompare(b.info.title)
      })
  }, [parsedPlaylist, shouldBuildSmartCollections, trackStats])

  const likedPathSet = useMemo(() => new Set(likedPaths), [likedPaths])

  const customSmartCollections = useMemo(() => {
    if (!shouldBuildSmartCollections) return []
    const now = Date.now()
    return userSmartCollections.map((collection) => ({
      ...collection,
      kind: 'custom',
      icon: Wand2,
      tracks: parsedPlaylist.filter((track) =>
        matchTrackAgainstSmartCollection(track, collection.rules, trackStats, likedPathSet, now)
      )
    }))
  }, [likedPathSet, parsedPlaylist, shouldBuildSmartCollections, trackStats, userSmartCollections])

  const smartCollections = useMemo(
    () => [
      {
        id: 'recent-played',
        name: t('playlists.recentPlayed', 'Recently played'),
        icon: History,
        kind: 'builtin',
        tracks: recentPlayedTracks
      },
      {
        id: 'most-played',
        name: t('playlists.mostPlayed', 'Most played'),
        icon: Repeat1,
        kind: 'builtin',
        tracks: mostPlayedTracks
      },
      ...customSmartCollections
    ],
    [t, recentPlayedTracks, mostPlayedTracks, customSmartCollections]
  )

  const selectedSmartCollection = useMemo(
    () => smartCollections.find((item) => item.id === selectedSmartCollectionId) || null,
    [smartCollections, selectedSmartCollectionId]
  )

  useEffect(() => {
    if (selectedSmartCollectionId && !selectedSmartCollection) {
      setSelectedSmartCollectionId(null)
    }
  }, [selectedSmartCollectionId, selectedSmartCollection])

  const describeSmartCollectionRules = useCallback(
    (rules) => {
      const normalized = normalizeSmartCollectionRules(rules)
      const items = []
      if (normalized.likedOnly) items.push(t('playlists.smartRuleLikedOnly', 'Liked songs'))
      if (normalized.minPlayCount) {
        items.push(
          t('playlists.smartRuleMinPlayCount', {
            count: normalized.minPlayCount,
            defaultValue: 'Played at least {{count}} times'
          })
        )
      }
      if (normalized.playedWithinDays) {
        items.push(
          t('playlists.smartRulePlayedWithinDays', {
            count: normalized.playedWithinDays,
            defaultValue: 'Played in the last {{count}} days'
          })
        )
      }
      if (normalized.addedWithinDays) {
        items.push(
          t('playlists.smartRuleAddedWithinDays', {
            count: normalized.addedWithinDays,
            defaultValue: 'Added in the last {{count}} days'
          })
        )
      }
      if (normalized.titleIncludes) {
        items.push(
          t('playlists.smartRuleTitleContains', {
            value: normalized.titleIncludes,
            defaultValue: 'Title contains "{{value}}"'
          })
        )
      }
      if (normalized.artistIncludes) {
        items.push(
          t('playlists.smartRuleArtistContains', {
            value: normalized.artistIncludes,
            defaultValue: 'Artist contains "{{value}}"'
          })
        )
      }
      if (normalized.albumIncludes) {
        items.push(
          t('playlists.smartRuleAlbumContains', {
            value: normalized.albumIncludes,
            defaultValue: 'Album contains "{{value}}"'
          })
        )
      }
      return items
    },
    [t]
  )

  const describeSmartCollectionDraft = useCallback(
    (draft) => {
      const normalized = normalizeSmartCollectionDraft(draft)
      const clauses = describeSmartCollectionRules(normalized.rules)
      if (clauses.length === 0) {
        return t(
          'playlists.smartPreviewEmpty',
          'This collection will start matching songs after you add a rule.'
        )
      }
      const joiner =
        normalized.rules.matchMode === 'any'
          ? t('playlists.smartPreviewAnyJoiner', ' or ')
          : t('playlists.smartPreviewAllJoiner', ' and ')
      return t('playlists.smartPreviewSentence', {
        rules: clauses.join(joiner),
        defaultValue: 'This collection will include songs that match {{rules}}.'
      })
    },
    [describeSmartCollectionRules, t]
  )

  const smartCollectionTemplates = useMemo(
    () => [
      {
        id: 'recent-added',
        label: t('playlists.templateRecentAdded', 'Recently added'),
        buildDraft: () => ({
          ...createSmartCollectionTemplateDraft('recent-added'),
          name: t('playlists.templateRecentAdded', 'Recently added')
        })
      },
      {
        id: 'recently-played',
        label: t('playlists.templateRecentListened', 'Recently listened'),
        buildDraft: () => ({
          ...createSmartCollectionTemplateDraft('recently-played'),
          name: t('playlists.templateRecentListened', 'Recently listened')
        })
      },
      {
        id: 'liked',
        label: t('playlists.templateMyLikes', 'My likes'),
        buildDraft: () => ({
          ...createSmartCollectionTemplateDraft('liked'),
          name: t('playlists.templateMyLikes', 'My likes')
        })
      }
    ],
    [t]
  )

  const userPlaylistTracks = useMemo(() => {
    if (!selectedUserPlaylist) return []
    const pathToTrack = new Map(parsedPlaylist.map((t) => [t.path, t]))
    return selectedUserPlaylist.paths.map((p) => pathToTrack.get(p)).filter(Boolean)
  }, [selectedUserPlaylist, parsedPlaylist])

  const smartCollectionTracks = useMemo(() => {
    if (!selectedSmartCollection || listMode !== 'playlists') return []
    return selectedSmartCollection.tracks
  }, [selectedSmartCollection, listMode])

  const playlistDetailFiltered = useMemo(() => {
    if (listMode !== 'playlists' || (!selectedUserPlaylistId && !selectedSmartCollectionId))
      return []
    const list = selectedSmartCollectionId ? smartCollectionTracks : userPlaylistTracks
    return filterAndRankTracksBySearch(list, searchQuery)
  }, [
    userPlaylistTracks,
    smartCollectionTracks,
    searchQuery,
    selectedUserPlaylistId,
    selectedSmartCollectionId,
    listMode
  ])

  const sidebarPlaybackContext = useMemo(() => {
    if (listMode === 'playlists' && selectedUserPlaylistId && selectedUserPlaylist) {
      return createPlaybackContext(
        'userPlaylist',
        selectedUserPlaylistId,
        selectedUserPlaylist.paths
      )
    }
    if (listMode === 'playlists' && selectedSmartCollectionId && selectedSmartCollection) {
      return createPlaybackContext(
        'smartCollection',
        selectedSmartCollectionId,
        smartCollectionTracks.map((track) => track.path)
      )
    }
    if (listMode === 'album' && selectedAlbum && selectedAlbum !== 'all') {
      const albumBucket = albumBuckets.find((a) => a.name === selectedAlbum)
      if (albumBucket?.tracks?.length > 0) {
        const sortedPaths = [...albumBucket.tracks].sort(compareTrackOrder).map((t) => t.path)
        return createPlaybackContext('albumGroup', selectedAlbum, sortedPaths)
      }
    }
    return createPlaybackContext('library', 'library', [])
  }, [
    listMode,
    selectedUserPlaylistId,
    selectedUserPlaylist,
    selectedSmartCollectionId,
    selectedSmartCollection,
    smartCollectionTracks,
    selectedAlbum,
    albumBuckets
  ])

  const stopCastBeforeLocalPlayback = useCallback(async () => {
    const status = lastCastStatus
    if (!isCastSessionActive(status)) return

    setCastRemoteActive(false)
    setLastCastStatus((prev) =>
      prev
        ? {
            ...prev,
            castActive: false,
            airplayActive: false,
            transportState: 'STOPPED',
            isPlaying: false
          }
        : prev
    )

    try {
      if (window.api?.cast?.stopPlayback) {
        await window.api.cast.stopPlayback()
      } else if (status?.castKind === 'airplay' && window.api?.cast?.airplayCommand) {
        await window.api.cast.airplayCommand('stop')
      } else {
        await window.api?.stopAudio?.()
      }
    } catch (e) {
      console.warn('[cast] failed to stop before local playback:', e?.message || e)
    }
  }, [lastCastStatus])

  const playFromHistoryEntry = useCallback(
    async (entry) => {
      const normalizedEntry = normalizePlaybackHistoryEntry(entry)
      if (!normalizedEntry?.path) return false

      const existingIndex = playlistRef.current.findIndex(
        (track) => track.path === normalizedEntry.path
      )
      const targetIndex = existingIndex >= 0 ? existingIndex : playlistRef.current.length

      if (existingIndex < 0) {
        const fallbackName = fileNameFromPath(normalizedEntry.path)
        const title = normalizedEntry.title || stripExtension(fallbackName) || fallbackName
        const historyTrack = {
          path: normalizedEntry.path,
          name: title || fallbackName,
          info: {
            title,
            artist: normalizedEntry.artist || '',
            album: normalizedEntry.album || '',
            cover: entry?.cover || null
          }
        }
        setPlaylist((prev) => {
          if (prev.some((track) => track.path === historyTrack.path)) return prev
          return [...prev, historyTrack]
        })
      }

      await stopCastBeforeLocalPlayback()
      setActivePlaybackContext(createPlaybackContext('library', 'history', [normalizedEntry.path]))
      setCurrentIndex(targetIndex)
      setIsPlaying(true)
      return true
    },
    [stopCastBeforeLocalPlayback]
  )

  const startPlaybackForTrack = useCallback(
    async (track, playbackContext = null) => {
      if (!track) return
      await stopCastBeforeLocalPlayback()
      setActivePlaybackContext(playbackContext || createPlaybackContext('library', 'library', []))
      setCurrentIndex(track.originalIdx)
      setIsPlaying(true)
    },
    [stopCastBeforeLocalPlayback]
  )

  const ensureRemoteTracksInPlaylist = useCallback((tracks, activeTrack) => {
    const normalizedTracks = []
    const seen = new Set()
    const pushTrack = (item) => {
      if (!item?.path || seen.has(item.path)) return
      seen.add(item.path)
      const remoteMeta = buildRemoteTrackMeta(item)
      normalizedTracks.push({
        ...item,
        name: item.name || item.title || remoteMeta.title,
        info: {
          ...(item.info || {}),
          ...remoteMeta
        },
        __remoteMeta: remoteMeta
      })
    }

    ;(Array.isArray(tracks) ? tracks : []).forEach(pushTrack)
    pushTrack(activeTrack)
    if (normalizedTracks.length === 0) return { targetIndex: -1, trackPaths: [] }

    const cacheEntries = {}
    for (const item of normalizedTracks) {
      cacheEntries[item.path] = item.__remoteMeta
    }
    writeTrackMetaCache(cacheEntries)
    setTrackMetaMap((prev) => {
      const next = { ...prev }
      for (const item of normalizedTracks) {
        next[item.path] = mergeRemoteTrackMeta(prev[item.path], item.__remoteMeta)
      }
      return next
    })

    const existingPlaylist = playlistRef.current || []
    const nextPlaylist = [...existingPlaylist]
    const existingPaths = new Set(existingPlaylist.map((item) => item?.path).filter(Boolean))
    for (const { __remoteMeta, ...item } of normalizedTracks) {
      if (existingPaths.has(item.path)) continue
      existingPaths.add(item.path)
      nextPlaylist.push(item)
    }

    if (nextPlaylist.length !== existingPlaylist.length) {
      setPlaylist(nextPlaylist)
    }

    return {
      targetIndex: nextPlaylist.findIndex((item) => item?.path === activeTrack?.path),
      trackPaths: normalizedTracks.map((item) => item.path)
    }
  }, [])

  const playRemoteLibraryTrack = useCallback(
    async (track, options = {}) => {
      const { targetIndex, trackPaths } = ensureRemoteTracksInPlaylist(options.contextTracks, track)
      if (targetIndex < 0) return
      await stopCastBeforeLocalPlayback()
      setActivePlaybackContext(createPlaybackContext('remoteLibrary', 'remoteLibrary', trackPaths))
      setCurrentIndex(targetIndex)
      setIsPlaying(true)
    },
    [ensureRemoteTracksInPlaylist, stopCastBeforeLocalPlayback]
  )

  const queueRemoteLibraryTrack = useCallback(
    (track) => {
      const { targetIndex } = ensureRemoteTracksInPlaylist([], track)
      if (targetIndex < 0) return
      enqueueUpNextTrack(track)
    },
    [enqueueUpNextTrack, ensureRemoteTracksInPlaylist]
  )

  const buildStreamingPlaylistTrack = useCallback((track) => {
    const title = track?.title || track?.name || 'Streaming Track'
    const artist = track?.artist || ''
    const album = track?.album || track?.providerLabel || 'Streaming'
    const providerLabel = track?.providerLabel || track?.provider || 'Streaming'
    return {
      ...track,
      path: track?.path,
      name: title,
      title,
      artist,
      album,
      duration: Number(track?.duration || 0) || 0,
      remote: true,
      remoteType: 'streaming',
      streamingProvider: track?.provider || '',
      streamingPlaybackMode: track?.playbackMode || 'nativeStream',
      info: {
        ...(track?.info || {}),
        title,
        artist,
        album,
        cover: track?.cover || track?.info?.cover || '',
        duration: Number(track?.duration || 0) || undefined,
        source: providerLabel,
        remoteType: 'streaming',
        streamingProvider: track?.provider || '',
        streamingPlaybackMode: track?.playbackMode || 'nativeStream',
        codec: track?.qualityLabel || ''
      }
    }
  }, [])

  const ensureStreamingTracksInPlaylist = useCallback(
    (tracks, activeTrack) => {
      const normalizedTracks = []
      const seen = new Set()
      const pushTrack = (item) => {
        if (!item?.path || seen.has(item.path)) return
        seen.add(item.path)
        normalizedTracks.push(buildStreamingPlaylistTrack(item))
      }
      ;(Array.isArray(tracks) ? tracks : []).forEach(pushTrack)
      pushTrack(activeTrack)
      if (normalizedTracks.length === 0) {
        return { targetIndex: -1, trackPaths: [] }
      }

      const existingPlaylist = playlistRef.current || []
      const nextPlaylist = [...existingPlaylist]
      const existingPaths = new Set(existingPlaylist.map((item) => item?.path).filter(Boolean))
      for (const item of normalizedTracks) {
        if (existingPaths.has(item.path)) continue
        existingPaths.add(item.path)
        nextPlaylist.push(item)
      }

      if (nextPlaylist.length !== existingPlaylist.length) {
        setPlaylist(nextPlaylist)
      }

      return {
        targetIndex: nextPlaylist.findIndex((item) => item?.path === activeTrack?.path),
        trackPaths: normalizedTracks.map((item) => item.path)
      }
    },
    [buildStreamingPlaylistTrack]
  )

  const playStreamingTrack = useCallback(
    async (track, options = {}) => {
      if (track?.playbackMode !== 'nativeStream') {
        const result = await window.api?.streaming?.resolvePlayback?.(track)
        return {
          ok: false,
          message:
            result?.message ||
            t(
              'streaming.notices.controlledPlaybackOnly',
              'This provider currently only supports official controlled playback. ECHO will bypass WASAPI Exclusive / EQ automatically.'
            )
        }
      }
      const resolved = await window.api?.streaming?.resolvePlayback?.(track)
      if (!resolved?.ok || !resolved?.url) {
        await window.api?.stopAudio?.()
        return {
          ok: false,
          message:
            resolved?.message ||
            (track?.provider === 'qqMusic'
              ? t(
                  'streaming.notices.qqPlaybackFailed',
                  'QQ audio source resolution failed. Old audio was stopped to avoid fake playback. Sign in to QQ Music again or choose another quality/track.'
                )
              : t(
                  'streaming.notices.playbackFailed',
                  'Streaming source resolution failed. Old audio was stopped to avoid fake playback.'
                ))
        }
      }
      const { targetIndex, trackPaths } = ensureStreamingTracksInPlaylist(options.contextTracks, track)
      if (targetIndex < 0) {
        return {
          ok: false,
          message: t('streaming.notices.playbackPrepareFailed', 'Could not prepare streaming playback.')
        }
      }
      await stopCastBeforeLocalPlayback()
      setActivePlaybackContext(createPlaybackContext('streaming', 'search', trackPaths))
      setCurrentIndex(targetIndex)
      setIsPlaying(true)
      return { ok: true }
    },
    [ensureStreamingTracksInPlaylist, stopCastBeforeLocalPlayback, t]
  )

  const playPlaylistContextNow = useCallback(
    async (options = {}) => {
      const context = sidebarPlaybackContext
      const candidatePaths =
        context.kind === 'library'
          ? getLibraryPlaybackPaths()
          : dedupePathList(context.trackPaths).filter((path) =>
              playlistRef.current.some((track) => track.path === path)
            )

      if (candidatePaths.length === 0) return

      const shuffle = options?.shuffle === true
      const targetPath = shuffle
        ? candidatePaths[Math.floor(Math.random() * candidatePaths.length)]
        : candidatePaths[0]
      const nextIdx = playlistRef.current.findIndex((track) => track.path === targetPath)
      if (nextIdx === -1) return

      await stopCastBeforeLocalPlayback()
      if (shuffle) setPlayMode('shuffle')
      setActivePlaybackContext(context)
      setCurrentIndex(nextIdx)
      setIsPlaying(true)
    },
    [sidebarPlaybackContext, getLibraryPlaybackPaths, stopCastBeforeLocalPlayback]
  )

  const upNextPreviewTracks = useMemo(() => {
    if (upNextQueue.length === 0) return []
    const pathToTrack = new Map(parsedPlaylist.map((track) => [track.path, track]))
    return upNextQueue.map((item) => pathToTrack.get(item?.path)).filter(Boolean)
  }, [upNextQueue, parsedPlaylist])

  const upNextSidebarItems = useMemo(() => {
    if (upNextQueue.length === 0) return []
    const pathToTrack = new Map(parsedPlaylist.map((track) => [track.path, track]))
    return upNextQueue
      .map((item) => {
        const track = pathToTrack.get(item?.path)
        return track ? { path: item.path, track } : null
      })
      .filter(Boolean)
  }, [upNextQueue, parsedPlaylist])

  const queueSortSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  )

  const handleQueueSortEnd = useCallback((event) => {
    const { active, over } = event
    if (!active?.id || !over?.id || active.id === over.id) return
    setUpNextQueue((prev) => {
      const oldIndex = prev.findIndex((item) => item?.path === active.id)
      const newIndex = prev.findIndex((item) => item?.path === over.id)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const reorderUpNextQueueByPath = useCallback((activePath, overPath) => {
    if (!activePath || !overPath || activePath === overPath) return
    setUpNextQueue((prev) => {
      const oldIndex = prev.findIndex((item) => item?.path === activePath)
      const newIndex = prev.findIndex((item) => item?.path === overPath)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const moveUpNextPathToTop = useCallback((path) => {
    if (!path) return
    setUpNextQueue((prev) => {
      const item = prev.find((entry) => entry?.path === path)
      if (!item || prev[0]?.path === path) return prev
      return [item, ...prev.filter((entry) => entry?.path !== path)]
    })
  }, [])

  const moveUpNextPathToBottom = useCallback((path) => {
    if (!path) return
    setUpNextQueue((prev) => {
      const item = prev.find((entry) => entry?.path === path)
      if (!item || prev[prev.length - 1]?.path === path) return prev
      return [...prev.filter((entry) => entry?.path !== path), item]
    })
  }, [])

  const removeUpNextAboveWithUndo = useCallback(
    (path) => {
      if (!path) return
      setUpNextQueue((prev) => {
        const index = prev.findIndex((item) => item?.path === path)
        if (index <= 0) return prev
        pushQueueUndoSnapshot(prev)
        return prev.slice(index)
      })
    },
    [pushQueueUndoSnapshot]
  )

  const removeUpNextBelowWithUndo = useCallback(
    (path) => {
      if (!path) return
      setUpNextQueue((prev) => {
        const index = prev.findIndex((item) => item?.path === path)
        if (index === -1 || index >= prev.length - 1) return prev
        pushQueueUndoSnapshot(prev)
        return prev.slice(0, index + 1)
      })
    },
    [pushQueueUndoSnapshot]
  )

  const shuffleUpNextQueue = useCallback(() => {
    setUpNextQueue((prev) => {
      if (prev.length < 2) return prev
      const currentPath = playlistRef.current[currentIndexRef.current]?.path || ''
      const currentQueueIndex = prev.findIndex((item) => item?.path === currentPath)
      const lockedPrefix = currentQueueIndex >= 0 ? prev.slice(0, currentQueueIndex + 1) : []
      const pool = currentQueueIndex >= 0 ? prev.slice(currentQueueIndex + 1) : [...prev]
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      return [...lockedPrefix, ...pool]
    })
  }, [])

  const playUpNextQueueItemNow = useCallback(
    async (path) => {
      if (!path) return
      const trackIndex = playlistRef.current.findIndex((track) => track.path === path)
      if (trackIndex === -1) return
      await stopCastBeforeLocalPlayback()
      setUpNextQueue((prev) => {
        const queueIndex = prev.findIndex((item) => item?.path === path)
        if (queueIndex === -1) return prev
        return prev.slice(queueIndex + 1)
      })
      setCurrentIndex(trackIndex)
      setQueuePlaybackEnabled(true)
      setIsPlaying(true)
    },
    [stopCastBeforeLocalPlayback]
  )

  const playUpNextPathNext = useCallback(
    (path) => {
      const track = playlistRef.current.find((item) => item.path === path)
      if (!track) return
      enqueueUpNextTrackAtFront(track)
    },
    [enqueueUpNextTrackAtFront]
  )

  const saveUpNextQueueAsPlaylist = useCallback(() => {
    const paths = upNextQueueRef.current.map((item) => item?.path).filter(Boolean)
    if (paths.length === 0) return { ok: false, reason: 'empty' }
    const fallbackName = t('queue.defaultPlaylistName', {
      defaultValue: 'Up Next'
    })
    const name = window.prompt(t('queue.savePrompt', 'Playlist name'), fallbackName)
    const normalizedName = String(name || '').trim()
    if (!normalizedName) return { ok: false, reason: 'cancelled' }
    const id = crypto.randomUUID()
    setUserPlaylists((prev) => [...prev, { id, name: normalizedName, paths: [...new Set(paths)] }])
    setSelectedSmartCollectionId(null)
    setSelectedUserPlaylistId(id)
    setListMode('playlists')
    return { ok: true, name: normalizedName }
  }, [t])

  const playbackHistoryEntries = useMemo(() => {
    if (listMode !== 'history') return []
    if (playbackHistory.length === 0) return []
    const now = Date.now()
    const pathToTrackInLibrary = new Map(playlist.map((track) => [track.path, track]))
    const indexedEntries = playbackHistory
      .map((entry, historyIndex) => {
        const normalizedEntry = normalizePlaybackHistoryEntry(entry)
        if (!normalizedEntry) return null
        return { ...normalizedEntry, historyIndex }
      })
      .filter(Boolean)
    const sourceEntries = config.historyCollapseRepeats
      ? indexedEntries.reduce((acc, entry) => {
          const previous = acc[acc.length - 1]
          if (previous?.path === entry.path) acc[acc.length - 1] = { ...previous, ...entry }
          else acc.push(entry)
          return acc
        }, [])
      : indexedEntries

    return sourceEntries
      .map((entry) => {
        const track = pathToTrackInLibrary.get(entry.path)
        const meta = effectiveTrackMetaMap[entry.path] || {}
        const info = track ? parseTrackInfo(track, meta) : meta
        const album = info?.album || entry.album || ''
        const artist =
          info?.artist && info.artist !== 'Unknown Artist'
            ? info.artist
            : entry.artist || albumArtistByName[album] || ''
        const title =
          info?.title ||
          entry.title ||
          stripExtension(track?.name || fileNameFromPath(entry.path)) ||
          entry.path
        const cover =
          info?.cover ||
          meta?.cover ||
          track?.info?.cover ||
          (album && albumCoverMap[album]) ||
          null
        return {
          ...entry,
          title,
          artist,
          album,
          cover,
          track,
          inCurrentPlaylist: !!track,
          bucket: getHistoryBucket(entry.playedAt, now),
          relativeTime: buildHistoryRelativeTime(entry.playedAt, t, now),
          playCount: Number(trackStats[entry.path]?.playCount) || 0
        }
      })
      .reverse()
      .sort((a, b) => {
        const timeA = Number(a.playedAt || 0)
        const timeB = Number(b.playedAt || 0)
        if (timeA !== timeB) return timeB - timeA
        return b.historyIndex - a.historyIndex
      })
  }, [
    albumArtistByName,
    albumCoverMap,
    config.historyCollapseRepeats,
    effectiveTrackMetaMap,
    listMode,
    playbackHistory,
    playlist,
    t,
    trackStats
  ])

  const tracksForSidebarList = useMemo(() => {
    if (listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId)) {
      return playlistDetailFiltered
    }
    return filteredPlaylist
  }, [
    listMode,
    selectedUserPlaylistId,
    selectedSmartCollectionId,
    playlistDetailFiltered,
    filteredPlaylist
  ])

  const tracksForSidebarListFiltered = useMemo(() => {
    if (
      !showLikedOnly ||
      (listMode !== 'songs' &&
        listMode !== 'album' &&
        listMode !== 'folders' &&
        listMode !== 'artists' &&
        !(listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId)))
    ) {
      return tracksForSidebarList
    }
    return tracksForSidebarList.filter((t) => likedSet.has(t.path))
  }, [
    tracksForSidebarList,
    showLikedOnly,
    listMode,
    selectedUserPlaylistId,
    selectedSmartCollectionId,
    likedSet
  ])

  const sidebarListIsDetail = useMemo(
    () => listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId),
    [listMode, selectedUserPlaylistId, selectedSmartCollectionId]
  )
  const renamableVisibleTracks = useMemo(
    () => tracksForSidebarListFiltered.filter((track) => isLocalAudioFilePath(track?.path)),
    [tracksForSidebarListFiltered]
  )
  const sidebarRowHeight = sidebarListIsDetail ? SIDEBAR_DETAIL_ROW_HEIGHT : SIDEBAR_ROW_HEIGHT
  const [sidebarScrollTop, setSidebarScrollTop] = useState(0)
  const [sidebarViewportHeight, setSidebarViewportHeight] = useState(0)
  const [sidebarScrollHeight, setSidebarScrollHeight] = useState(0)
  const [albumGridScrollTop, setAlbumGridScrollTop] = useState(0)
  const [albumGridViewportHeight, setAlbumGridViewportHeight] = useState(0)
  const [albumGridColumnCount, setAlbumGridColumnCount] = useState(1)
  const [albumGridRowHeight, setAlbumGridRowHeight] = useState(ALBUM_GRID_DEFAULT_ROW_HEIGHT)
  const [albumGridRowGap, setAlbumGridRowGap] = useState(ALBUM_GRID_DEFAULT_GAP)
  const [albumGridOffsetTop, setAlbumGridOffsetTop] = useState(0)

  const visibleSidebarRange = useMemo(() => {
    const total = tracksForSidebarListFiltered.length
    if (total <= 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacer: 0,
        bottomSpacer: 0
      }
    }

    const effectiveViewportHeight = Math.max(sidebarViewportHeight, sidebarRowHeight * 8)
    const startIndex = Math.max(
      0,
      Math.floor(sidebarScrollTop / sidebarRowHeight) - SIDEBAR_LIST_OVERSCAN
    )
    const endIndex = Math.min(
      total,
      Math.ceil((sidebarScrollTop + effectiveViewportHeight) / sidebarRowHeight) +
        SIDEBAR_LIST_OVERSCAN
    )

    return {
      startIndex,
      endIndex,
      topSpacer: startIndex * sidebarRowHeight,
      bottomSpacer: Math.max(0, (total - endIndex) * sidebarRowHeight)
    }
  }, [
    tracksForSidebarListFiltered.length,
    sidebarScrollTop,
    sidebarViewportHeight,
    sidebarRowHeight
  ])

  const visibleSidebarTracks = useMemo(
    () =>
      tracksForSidebarListFiltered.slice(
        visibleSidebarRange.startIndex,
        visibleSidebarRange.endIndex
      ),
    [tracksForSidebarListFiltered, visibleSidebarRange]
  )

  const handleSidebarTrackSelectionClick = useCallback(
    (track, event) => {
      if (!track?.path || (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey)) return false
      const orderedPaths = tracksForSidebarListFiltered.map((item) => item.path).filter(Boolean)
      setSelectedSidebarTrackPaths((prev) => {
        const next = new Set(prev)
        if (event.shiftKey && lastSelectedSidebarTrackPathRef.current) {
          const from = orderedPaths.indexOf(lastSelectedSidebarTrackPathRef.current)
          const to = orderedPaths.indexOf(track.path)
          if (from !== -1 && to !== -1) {
            next.clear()
            const start = Math.min(from, to)
            const end = Math.max(from, to)
            for (let i = start; i <= end; i += 1) next.add(orderedPaths[i])
          }
        } else if (next.has(track.path)) {
          next.delete(track.path)
        } else {
          next.add(track.path)
        }
        return [...next]
      })
      lastSelectedSidebarTrackPathRef.current = track.path
      return true
    },
    [tracksForSidebarListFiltered]
  )

  const metadataPrefetchSidebarTracks = useMemo(() => {
    if (!libraryBrowserVisible) return []
    if (tracksForSidebarListFiltered.length === 0) return []
    const startIndex = Math.max(
      0,
      visibleSidebarRange.startIndex - SIDEBAR_META_PREFETCH_BEHIND_ROWS
    )
    const endIndex = Math.min(
      tracksForSidebarListFiltered.length,
      visibleSidebarRange.endIndex + SIDEBAR_META_PREFETCH_AHEAD_ROWS
    )
    return tracksForSidebarListFiltered.slice(startIndex, endIndex)
  }, [libraryBrowserVisible, tracksForSidebarListFiltered, visibleSidebarRange])

  useEffect(() => {
    if (!libraryBrowserVisible) return undefined
    const playlistElement = sidebarPlaylistRef.current
    if (!playlistElement) return undefined

    const syncMetrics = () => {
      setSidebarViewportHeight(playlistElement.clientHeight || 0)
      setSidebarScrollHeight(playlistElement.scrollHeight || 0)
      setSidebarScrollTop(playlistElement.scrollTop || 0)
    }

    syncMetrics()

    if (typeof ResizeObserver === 'undefined') {
      const fallbackId = window.setInterval(syncMetrics, 250)
      return () => clearInterval(fallbackId)
    }

    const ro = new ResizeObserver(() => {
      syncMetrics()
    })
    ro.observe(playlistElement)
    return () => ro.disconnect()
  }, [libraryBrowserVisible, listMode, selectedUserPlaylistId, selectedSmartCollectionId])

  const handleSidebarScroll = useCallback((event) => {
    setSidebarScrollHeight(event.currentTarget.scrollHeight || 0)
    setSidebarViewportHeight(event.currentTarget.clientHeight || 0)
    setSidebarScrollTop(event.currentTarget.scrollTop || 0)
  }, [])

  const sidebarScrollbarMetrics = useMemo(() => {
    const viewportHeight = sidebarViewportHeight || 0
    const scrollHeight = sidebarScrollHeight || 0
    const visible = scrollHeight > viewportHeight + 2
    if (!visible) return { visible: false, thumbTop: 0, thumbHeight: 0 }
    const trackHeight = Math.max(1, viewportHeight - 24)
    const thumbHeight = Math.max(48, Math.round((viewportHeight / scrollHeight) * trackHeight))
    const maxScrollTop = Math.max(1, scrollHeight - viewportHeight)
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight)
    const thumbTop = Math.round((sidebarScrollTop / maxScrollTop) * maxThumbTop)
    return { visible: true, thumbTop, thumbHeight }
  }, [sidebarScrollHeight, sidebarScrollTop, sidebarViewportHeight])

  const scrollSidebarToPointer = useCallback((clientY) => {
    const root = sidebarPlaylistRef.current
    const drag = sidebarScrollbarDragRef.current
    if (!root || !drag?.track) return
    const rect = drag.track.getBoundingClientRect()
    const maxThumbTop = Math.max(1, rect.height - drag.thumbHeight)
    const nextThumbTop = Math.min(maxThumbTop, Math.max(0, clientY - rect.top - drag.pointerOffset))
    root.scrollTop =
      (nextThumbTop / maxThumbTop) * Math.max(0, root.scrollHeight - root.clientHeight)
  }, [])

  const handleSidebarScrollbarPointerDown = useCallback(
    (event) => {
      if (!sidebarScrollbarMetrics.visible) return
      const target = event.target
      const thumb = target?.closest?.('.playlist-scrollbar-thumb')
      const track = event.currentTarget
      const thumbRect = thumb?.getBoundingClientRect?.()
      const pointerOffset = thumbRect
        ? event.clientY - thumbRect.top
        : sidebarScrollbarMetrics.thumbHeight / 2
      sidebarScrollbarDragRef.current = {
        track,
        pointerOffset,
        thumbHeight: sidebarScrollbarMetrics.thumbHeight
      }
      track.setPointerCapture?.(event.pointerId)
      scrollSidebarToPointer(event.clientY)
      event.preventDefault()
    },
    [scrollSidebarToPointer, sidebarScrollbarMetrics.thumbHeight, sidebarScrollbarMetrics.visible]
  )

  const handleSidebarScrollbarPointerMove = useCallback(
    (event) => {
      if (!sidebarScrollbarDragRef.current) return
      scrollSidebarToPointer(event.clientY)
    },
    [scrollSidebarToPointer]
  )

  const handleSidebarScrollbarPointerUp = useCallback((event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    sidebarScrollbarDragRef.current = null
  }, [])

  const setAlbumGridElement = useCallback((node) => {
    if (!node) {
      if (albumGridRef.current && !albumGridRef.current.isConnected) {
        albumGridRef.current = null
      }
      return
    }
    if (node.closest('.playlist')) {
      albumGridRef.current = node
      return
    }
    if (!albumGridRef.current || !albumGridRef.current.isConnected) {
      albumGridRef.current = node
    }
  }, [])

  const handleQueueDragOver = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!queueDragOver) setQueueDragOver(true)
    },
    [queueDragOver]
  )

  const handleQueueDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget === e.target || !e.relatedTarget) setQueueDragOver(false)
  }, [])

  const handleQueueDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setQueueDragOver(false)
      const pathsPayload = e.dataTransfer.getData('application/x-echo-track-paths')
      let paths = []
      if (pathsPayload) {
        try {
          const parsed = JSON.parse(pathsPayload)
          if (Array.isArray(parsed)) paths = parsed.filter((item) => typeof item === 'string')
        } catch {
          paths = []
        }
      }
      const singlePath =
        e.dataTransfer.getData('application/x-echo-track-path') ||
        e.dataTransfer.getData('text/plain')
      if (singlePath) paths.push(singlePath)
      const uniquePaths = [...new Set(paths.filter(Boolean))]
      if (uniquePaths.length === 0) return { ok: false, reason: 'invalid_path' }
      const byPath = new Map(playlistRef.current.map((item) => [item.path, item]))
      const tracks = uniquePaths.map((path) => byPath.get(path)).filter(Boolean)
      if (tracks.length === 0) return { ok: false, reason: 'invalid_path' }
      return tracks.length === 1 ? enqueueUpNextTrack(tracks[0]) : enqueueUpNextTracks(tracks)
    },
    [enqueueUpNextTrack, enqueueUpNextTracks]
  )

  const albumGroupsFiltered = useMemo(() => {
    if (!showLikedOnly || listMode !== 'album') return albumGroups
    return albumGroups
      .map((album) => ({
        ...album,
        tracks: album.tracks.filter((t) => likedSet.has(t.path))
      }))
      .filter((album) => album.tracks.length > 0)
  }, [albumGroups, showLikedOnly, listMode, likedSet])

  const albumSortOptions = useMemo(
    () => [
      {
        key: 'default',
        label: t('albums.sortNameAsc', { defaultValue: '专辑名 (A-Z)' })
      },
      {
        key: 'nameDesc',
        label: t('albums.sortNameDesc', { defaultValue: '专辑名 (Z-A)' })
      },
      {
        key: 'artistAsc',
        label: t('albums.sortArtistAsc', { defaultValue: '艺人 (A-Z)' })
      },
      {
        key: 'artistDesc',
        label: t('albums.sortArtistDesc', { defaultValue: '艺人 (Z-A)' })
      },
      {
        key: 'tracksAsc',
        label: t('albums.sortTracksAsc', { defaultValue: '曲目数 (少)' })
      },
      {
        key: 'tracksDesc',
        label: t('albums.sortTracksDesc', { defaultValue: '曲目数 (多)' })
      },
      { key: 'dateAsc', label: t('folders.sortDateAsc') },
      { key: 'dateDesc', label: t('folders.sortDateDesc') }
    ],
    [t]
  )
  const activeAlbumSortLabel =
    albumSortOptions.find((option) => option.key === albumSortMode)?.label ||
    albumSortOptions[0]?.label

  const artistSortOptions = useMemo(
    () => [
      { key: 'default', label: t('artists.sortDefault', 'Default') },
      { key: 'nameAsc', label: t('artists.sortNameAsc', 'Artist name (A-Z)') },
      { key: 'nameDesc', label: t('artists.sortNameDesc', 'Artist name (Z-A)') },
      { key: 'tracksAsc', label: t('artists.sortTracksAsc', 'Track count (Low)') },
      { key: 'tracksDesc', label: t('artists.sortTracksDesc', 'Track count (High)') },
      { key: 'dateAsc', label: t('artists.sortDateAsc', 'Oldest added') },
      { key: 'dateDesc', label: t('artists.sortDateDesc', 'Newest added') }
    ],
    [t]
  )
  const activeArtistSortLabel =
    artistSortOptions.find((option) => option.key === artistSortMode)?.label ||
    artistSortOptions[0]?.label

  useEffect(() => {
    if (!libraryBrowserVisible || listMode !== 'album' || selectedAlbum !== 'all') {
      setAlbumGridScrollTop(0)
      setAlbumGridViewportHeight(0)
      return undefined
    }

    const playlistElement = sidebarPlaylistRef.current
    const gridElement = albumGridRef.current
    if (!playlistElement || !gridElement) return undefined

    const syncMetrics = () => {
      const playlistRect = playlistElement.getBoundingClientRect()
      const gridRect = gridElement.getBoundingClientRect()
      const computed = window.getComputedStyle(gridElement)
      const rowGap =
        Number.parseFloat(computed.rowGap || computed.gap || `${ALBUM_GRID_DEFAULT_GAP}`) ||
        ALBUM_GRID_DEFAULT_GAP
      const firstCard = gridElement.querySelector('.album-card')
      const firstCardRect = firstCard?.getBoundingClientRect?.()
      const nextWidth = Math.round(gridElement.clientWidth || gridRect.width || 0)
      const nextRowHeight = Math.round(firstCardRect?.height || 0) || ALBUM_GRID_DEFAULT_ROW_HEIGHT
      const nextOffsetTop = Math.max(
        0,
        Math.round(gridRect.top - playlistRect.top + (playlistElement.scrollTop || 0))
      )

      let nextColumnCount = 1
      if (firstCardRect?.width) {
        nextColumnCount = Math.max(
          1,
          Math.floor((nextWidth + rowGap) / (firstCardRect.width + rowGap))
        )
      }

      setAlbumGridRowGap((prev) => (prev === rowGap ? prev : rowGap))
      setAlbumGridRowHeight((prev) => (prev === nextRowHeight ? prev : nextRowHeight))
      setAlbumGridOffsetTop((prev) => (prev === nextOffsetTop ? prev : nextOffsetTop))
      setAlbumGridColumnCount((prev) => (prev === nextColumnCount ? prev : nextColumnCount))
    }

    syncMetrics()

    if (typeof ResizeObserver === 'undefined') {
      const fallbackId = window.setInterval(syncMetrics, 250)
      return () => clearInterval(fallbackId)
    }

    const ro = new ResizeObserver(() => {
      syncMetrics()
    })
    ro.observe(playlistElement)
    ro.observe(gridElement)
    const firstCard = gridElement.querySelector('.album-card')
    if (firstCard) ro.observe(firstCard)
    return () => ro.disconnect()
  }, [libraryBrowserVisible, listMode, selectedAlbum, albumGroupsFiltered.length])

  useEffect(() => {
    if (
      !libraryBrowserVisible ||
      listMode !== 'album' ||
      selectedAlbum !== 'all' ||
      !pendingAlbumOverviewRestoreRef.current
    ) {
      return
    }

    const playlistElement = sidebarPlaylistRef.current
    if (!playlistElement) return

    const restoreScroll = () => {
      playlistElement.scrollTop = albumOverviewScrollTopRef.current || 0
      setSidebarScrollTop(playlistElement.scrollTop || 0)
      pendingAlbumOverviewRestoreRef.current = false
    }

    const rafId = window.requestAnimationFrame(restoreScroll)
    return () => window.cancelAnimationFrame(rafId)
  }, [libraryBrowserVisible, listMode, selectedAlbum, albumGroupsFiltered.length])

  useEffect(() => {
    if (!libraryBrowserVisible || listMode !== 'album' || selectedAlbum !== 'all') {
      setAlbumGridScrollTop(0)
      setAlbumGridViewportHeight(0)
      return
    }

    const totalRows = Math.ceil(albumGroupsFiltered.length / Math.max(1, albumGridColumnCount))
    const totalHeight =
      totalRows > 0 ? totalRows * albumGridRowHeight + (totalRows - 1) * albumGridRowGap : 0
    const nextScrollTop = Math.max(0, sidebarScrollTop - albumGridOffsetTop)
    const visibleBottom = Math.max(0, sidebarScrollTop + sidebarViewportHeight - albumGridOffsetTop)
    const nextViewportHeight = Math.max(0, Math.min(totalHeight, visibleBottom) - nextScrollTop)

    setAlbumGridScrollTop((prev) => (prev === nextScrollTop ? prev : nextScrollTop))
    setAlbumGridViewportHeight((prev) => (prev === nextViewportHeight ? prev : nextViewportHeight))
  }, [
    listMode,
    libraryBrowserVisible,
    selectedAlbum,
    albumGroupsFiltered.length,
    albumGridColumnCount,
    albumGridOffsetTop,
    albumGridRowGap,
    albumGridRowHeight,
    sidebarScrollTop,
    sidebarViewportHeight
  ])

  const visibleAlbumRange = useMemo(() => {
    const total = albumGroupsFiltered.length
    const columnCount = Math.max(1, albumGridColumnCount)
    const totalRows = Math.ceil(total / columnCount)
    const rowStride = Math.max(1, albumGridRowHeight + albumGridRowGap)

    if (total <= 0 || totalRows <= 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacer: 0,
        bottomSpacer: 0
      }
    }

    const effectiveViewportHeight = Math.max(albumGridViewportHeight, rowStride * 4)
    const startRow = Math.max(0, Math.floor(albumGridScrollTop / rowStride) - SIDEBAR_LIST_OVERSCAN)
    const endRow = Math.min(
      totalRows,
      Math.ceil((albumGridScrollTop + effectiveViewportHeight) / rowStride) + SIDEBAR_LIST_OVERSCAN
    )

    return {
      startIndex: startRow * columnCount,
      endIndex: Math.min(total, endRow * columnCount),
      topSpacer: startRow * rowStride,
      bottomSpacer: Math.max(0, (totalRows - endRow) * rowStride)
    }
  }, [
    albumGroupsFiltered.length,
    albumGridColumnCount,
    albumGridRowGap,
    albumGridRowHeight,
    albumGridScrollTop,
    albumGridViewportHeight
  ])

  const visibleAlbumGroups = useMemo(
    () => albumGroupsFiltered.slice(visibleAlbumRange.startIndex, visibleAlbumRange.endIndex),
    [albumGroupsFiltered, visibleAlbumRange]
  )

  const metadataPrefetchAlbumGroups = useMemo(() => {
    if (!libraryBrowserVisible) return []
    if (albumGroupsFiltered.length === 0) return []
    const columnCount = Math.max(1, albumGridColumnCount)
    const visibleStart = Math.max(
      0,
      visibleAlbumRange.startIndex - columnCount * ALBUM_META_PREFETCH_BEHIND_ROWS
    )
    const visibleEnd = Math.min(
      albumGroupsFiltered.length,
      visibleAlbumRange.endIndex + columnCount * ALBUM_META_PREFETCH_AHEAD_ROWS
    )
    if (listMode === 'album' && selectedAlbum === 'all') {
      // Reorder so the cards currently in view (and a generous overscan) are
      // parsed first by the metadata worker pool. Otherwise the parse queue
      // walks albums in stored order, the first batch (METADATA_PARSE_BATCH_SIZE
      // tracks) only covers the top of the list, and visible cards further down
      // appear "missing" until the next batch lands - matching the reported
      // "loads half, then suddenly all loads" symptom on the album wall.
      const visible = albumGroupsFiltered.slice(visibleStart, visibleEnd)
      const before = albumGroupsFiltered.slice(0, visibleStart)
      const after = albumGroupsFiltered.slice(visibleEnd)
      return [...visible, ...after, ...before]
    }
    return albumGroupsFiltered.slice(visibleStart, visibleEnd)
  }, [
    albumGroupsFiltered,
    albumGridColumnCount,
    libraryBrowserVisible,
    listMode,
    selectedAlbum,
    visibleAlbumRange
  ])

  const folderGroupsFiltered = useMemo(() => {
    if (!showLikedOnly || listMode !== 'folders') return folderGroups
    return flattenFolderHierarchy(
      filterFolderHierarchy(folderTree, (track) => likedSet.has(track.path))
    )
  }, [folderGroups, folderTree, showLikedOnly, listMode, likedSet])
  const folderTreeFiltered = useMemo(() => {
    if (!showLikedOnly || listMode !== 'folders') return folderTree
    return filterFolderHierarchy(folderTree, (track) => likedSet.has(track.path))
  }, [folderTree, showLikedOnly, listMode, likedSet])
  const selectedFolderGroup = useMemo(() => {
    if (listMode !== 'folders' || selectedFolder === 'all') return null
    return folderGroupsFiltered.find((folder) => folder.folderPath === selectedFolder) || null
  }, [folderGroupsFiltered, listMode, selectedFolder])

  const showTrackList = useMemo(() => {
    if (!libraryBrowserVisible) return false
    if (listMode === 'songs') return true
    if (listMode === 'album' && selectedAlbum !== 'all') return true
    if (listMode === 'folders' && selectedFolder !== 'all') return true
    if (listMode === 'artists' && selectedArtist !== 'all') return true
    if (listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId))
      return true
    return false
  }, [
    listMode,
    libraryBrowserVisible,
    selectedAlbum,
    selectedFolder,
    selectedArtist,
    selectedUserPlaylistId,
    selectedSmartCollectionId
  ])

  useEffect(() => {
    if (config.autoLocateCurrentTrack !== true) {
      autoLocateHandledTrackPathRef.current = ''
      return
    }
    if (!showTrackList || showLyrics || view === 'settings') return

    const currentPath = currentTrack?.path || ''
    if (!currentPath) return
    if (autoLocateHandledTrackPathRef.current === currentPath) return

    const targetIndex = tracksForSidebarListFiltered.findIndex(
      (track) => track?.path === currentPath
    )
    if (targetIndex < 0) return

    const playlistElement = sidebarPlaylistRef.current
    if (!playlistElement) return

    const viewportHeight = playlistElement.clientHeight || sidebarViewportHeight || 0
    if (viewportHeight <= 0) return
    autoLocateHandledTrackPathRef.current = currentPath

    const rowTop = targetIndex * sidebarRowHeight
    const rowBottom = rowTop + sidebarRowHeight
    const currentTop = playlistElement.scrollTop || 0
    const currentBottom = currentTop + viewportHeight
    const comfortPadding = Math.min(sidebarRowHeight * 1.5, viewportHeight * 0.25)

    if (rowTop >= currentTop + comfortPadding && rowBottom <= currentBottom - comfortPadding) {
      return
    }

    const maxScrollTop = Math.max(
      0,
      tracksForSidebarListFiltered.length * sidebarRowHeight - viewportHeight
    )
    const targetTop = Math.min(
      maxScrollTop,
      Math.max(0, rowTop - Math.max(0, (viewportHeight - sidebarRowHeight) / 2))
    )

    playlistElement.scrollTo({ top: targetTop, behavior: 'smooth' })
    setSidebarScrollTop(targetTop)
  }, [
    config.autoLocateCurrentTrack,
    currentTrack?.path,
    showLyrics,
    showTrackList,
    sidebarRowHeight,
    sidebarViewportHeight,
    tracksForSidebarListFiltered,
    view
  ])

  const metadataPrefetchTracks = useMemo(() => {
    const byPath = new Map()
    const pushTrack = (track) => {
      if (!track?.path || byPath.has(track.path)) return
      byPath.set(track.path, track)
    }

    pushTrack(currentTrack)

    if (showTrackList) {
      for (const track of metadataPrefetchSidebarTracks) pushTrack(track)
    }

    if (listMode === 'album' && selectedAlbum === 'all') {
      const albumsNeedingCover = metadataPrefetchAlbumGroups.filter((album) => {
        if (album.cover) return false
        return album.tracks.some((track) => !trackMetaMap[track.path]?.cover)
      })
      const longestAlbumTrackCount = Math.max(
        0,
        ...albumsNeedingCover.map((album) => album.tracks.length)
      )

      for (
        let trackOffset = 0;
        trackOffset < longestAlbumTrackCount && byPath.size < ALBUM_METADATA_PREFETCH_LIMIT;
        trackOffset += 1
      ) {
        for (const album of albumsNeedingCover) {
          const track = album.tracks[trackOffset]
          if (!track?.path) continue
          const entry = trackMetaMap[track.path]
          if (entry?.cover) continue
          if (entry?.coverChecked === true && albumCoverProbePathsRef.current.has(track.path)) {
            continue
          }
          pushTrack(track)
          if (byPath.size >= ALBUM_METADATA_PREFETCH_LIMIT) break
        }
      }
    }

    const limit =
      listMode === 'album' && selectedAlbum === 'all'
        ? ALBUM_METADATA_PREFETCH_LIMIT
        : METADATA_PREFETCH_LIMIT
    return Array.from(byPath.values()).slice(0, limit)
  }, [
    currentTrack,
    listMode,
    metadataPrefetchAlbumGroups,
    metadataPrefetchSidebarTracks,
    selectedAlbum,
    showTrackList,
    trackMetaMap
  ])

  const metadataCoverKeepPathKey = useMemo(() => {
    const paths = []
    const pushTrack = (track) => {
      if (track?.path) paths.push(track.path)
    }

    pushTrack(currentTrack)

    if (showTrackList) {
      for (const track of metadataPrefetchSidebarTracks) pushTrack(track)
    }

    if (listMode === 'album' && selectedAlbum === 'all') {
      for (const album of visibleAlbumGroups) {
        pushTrack(album.tracks.find((track) => trackMetaMap[track.path]?.cover) || album.tracks[0])
      }
    }

    return [...new Set(paths)].join('\n')
  }, [
    currentTrack,
    listMode,
    metadataPrefetchSidebarTracks,
    selectedAlbum,
    showTrackList,
    trackMetaMap,
    visibleAlbumGroups
  ])

  const metadataCoverKeepPathSet = useMemo(() => {
    if (!metadataCoverKeepPathKey) return new Set()
    return new Set(metadataCoverKeepPathKey.split('\n').filter(Boolean))
  }, [metadataCoverKeepPathKey])

  useEffect(() => {
    setTrackMetaMap((prev) => {
      const next = trimTrackMetaCoverEntries(prev, metadataCoverKeepPathSet)
      return next === prev ? prev : next
    })
  }, [metadataCoverKeepPathSet])

  useEffect(() => {
    const pending = metadataPrefetchTracks.filter((track) => {
      const entry = trackMetaMap[track.path]
      if (entry?.coverMemoryTrimmed && metadataCoverKeepPathSet.has(track.path)) return true
      const shouldProbeMissingCover =
        entry?.coverChecked === true &&
        !entry?.cover &&
        entry?.coverMemoryTrimmed !== true &&
        !albumCoverProbePathsRef.current.has(track.path)
      const shouldProbeAlbumCover =
        listMode === 'album' &&
        selectedAlbum === 'all' &&
        !entry?.cover &&
        !albumCoverProbePathsRef.current.has(track.path)
      if (shouldProbeMissingCover) return true
      if (shouldProbeAlbumCover) return true
      if (!entry) return true
      return entry.cover == null && entry.coverChecked !== true
    })
    if (!pending.length) return undefined

    let cancelled = false

    const buildEmptyMetaEntry = () => ({
      title: null,
      artist: null,
      album: null,
      albumArtist: null,
      trackNo: null,
      discNo: null,
      cover: null,
      duration: null,
      coverChecked: true,
      bpmChecked: true,
      bpmMeasured: true,
      mqaChecked: true,
      codec: null,
      bitrateKbps: null,
      sampleRateHz: null,
      bitDepth: null,
      channels: null,
      isMqa: false,
      bpm: null
    })

    const loadMetadata = async () => {
      const loaded = {}
      const cached = await readTrackMetaCache(pending.map((track) => track.path))
      for (const [path, entry] of Object.entries(cached)) {
        loaded[path] = entry
      }
      const cachedAlbumCovers = {}
      for (const track of pending) {
        const cachedEntry = cached[track.path]
        if (!cachedEntry?.cover) continue
        const albumName = cachedEntry.album || track?.info?.album || 'Singles'
        if (albumName && !cachedAlbumCovers[albumName]) {
          cachedAlbumCovers[albumName] = {
            cover: cachedEntry.cover,
            artist: cachedEntry.albumArtist || cachedEntry.artist || track?.info?.artist || ''
          }
        }
      }
      if (!cancelled && Object.keys(cachedAlbumCovers).length > 0) {
        persistAlbumCoverCacheItems(
          Object.entries(cachedAlbumCovers).map(([albumName, entry]) => ({
            album: albumName,
            artist: entry.artist,
            cover: entry.cover
          }))
        )
        setAlbumCoverMap((prev) => {
          let changed = false
          const next = { ...prev }
          for (const [albumName, entry] of Object.entries(cachedAlbumCovers)) {
            const cover = entry.cover
            if (!next[albumName] && cover) {
              next[albumName] = cover
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
      if (!cancelled && Object.keys(cached).length > 0) {
        setTrackMetaMap((prev) => {
          const merged = mergeTrackMetaMapPreservingCovers(prev, cached)
          return trimTrackMetaCoverEntries(merged, metadataCoverKeepPathSet)
        })
      }

      const uncachedPending = pending.filter((track) => {
        const cachedMeta = cached[track.path]
        if (!cachedMeta) return true
        if (shouldRefreshTrackMetaCacheForAudioQuality(track.path, cachedMeta)) return true
        if (!cachedMeta.bpmChecked) return true
        if (!cachedMeta.mqaChecked) return true
        return !cachedMeta.cover && !albumCoverProbePathsRef.current.has(track.path)
      })
      if (cancelled) return
      const activePlaybackPath = currentTrack?.path || ''
      const playbackActive = isPlaying === true
      const parseCandidates =
        playbackActive && activePlaybackPath
          ? [
              ...uncachedPending.filter((track) => track?.path === activePlaybackPath),
              ...uncachedPending.filter((track) => track?.path !== activePlaybackPath)
            ]
          : uncachedPending
      const parseBatchSize =
        playbackActive && activePlaybackPath
          ? PLAYING_METADATA_PARSE_BATCH_SIZE
          : listMode === 'album' && selectedAlbum === 'all'
            ? ALBUM_METADATA_PARSE_BATCH_SIZE
            : METADATA_PARSE_BATCH_SIZE
      const parseWorkers =
        playbackActive && activePlaybackPath
          ? PLAYING_METADATA_PARSE_WORKERS
          : METADATA_PARSE_WORKERS
      const parseQueue = parseCandidates.slice(0, parseBatchSize)
      let nextIndex = 0

      // Stream parsed entries into trackMetaMap as workers complete tracks,
      // throttled to ~120ms, so visible album cards populate progressively
      // instead of waiting for the whole 48-track batch to finish.
      const STREAM_FLUSH_INTERVAL_MS = 120
      const pendingFlushPaths = []
      let lastFlushAt = 0
      const flushPendingMeta = (force = false) => {
        if (cancelled || pendingFlushPaths.length === 0) return
        const now = Date.now()
        if (!force && now - lastFlushAt < STREAM_FLUSH_INTERVAL_MS) return
        const flush = {}
        for (const path of pendingFlushPaths) {
          if (loaded[path]) flush[path] = loaded[path]
        }
        pendingFlushPaths.length = 0
        if (Object.keys(flush).length === 0) return
        lastFlushAt = now
        const flushAlbumCovers = {}
        for (const [path, entry] of Object.entries(flush)) {
          if (!entry?.cover) continue
          const track = parseQueue.find((t) => t?.path === path)
          const albumName = entry.album || track?.info?.album || 'Singles'
          if (albumName && !flushAlbumCovers[albumName]) {
            flushAlbumCovers[albumName] = {
              cover: entry.cover,
              artist: entry.albumArtist || entry.artist || track?.info?.artist || ''
            }
          }
        }
        if (Object.keys(flushAlbumCovers).length > 0) {
          setAlbumCoverMap((prev) => {
            let changed = false
            const next = { ...prev }
            for (const [albumName, item] of Object.entries(flushAlbumCovers)) {
              if (!next[albumName] && item.cover) {
                next[albumName] = item.cover
                changed = true
              }
            }
            return changed ? next : prev
          })
        }
        setTrackMetaMap((prev) => {
          const merged = mergeTrackMetaMapPreservingCovers(prev, flush)
          return trimTrackMetaCoverEntries(merged, metadataCoverKeepPathSet)
        })
      }

      const parseNextTrack = async () => {
        while (!cancelled) {
          const track = parseQueue[nextIndex]
          nextIndex += 1
          if (!track) return
          try {
            const data = await window.api.getExtendedMetadataHandler(track.path)
            if (data?.success) {
              const common = data.common || {}
              const technical = data.technical || {}
              const cachedMeta = cached[track.path] || {}
              loaded[track.path] = {
                title: common.title || cachedMeta.title || null,
                artist: common.artist || cachedMeta.artist || null,
                album: common.album || cachedMeta.album || null,
                albumArtist: common.albumArtist || cachedMeta.albumArtist || null,
                trackNo: common.trackNo ?? null,
                discNo: common.discNo ?? null,
                cover: common.cover || cachedMeta.cover || null,
                duration: technical.duration || cachedMeta.duration || null,
                coverChecked: true,
                bpmChecked: true,
                bpmMeasured: cachedMeta.bpmMeasured === true,
                mqaChecked: true,
                codec: technical.codec || cachedMeta.codec || null,
                bitrateKbps: technical.bitrate
                  ? Math.round(technical.bitrate / 1000)
                  : cachedMeta.bitrateKbps || null,
                sampleRateHz: technical.sampleRate || cachedMeta.sampleRateHz || null,
                bitDepth: technical.bitDepth || cachedMeta.bitDepth || null,
                channels: technical.channels || cachedMeta.channels || null,
                isMqa: technical.isMqa === true || cachedMeta.isMqa === true,
                bpm: cachedMeta.bpmMeasured ? cachedMeta.bpm || null : null
              }
            } else {
              loaded[track.path] = buildEmptyMetaEntry()
            }
          } catch (error) {
            loaded[track.path] = buildEmptyMetaEntry()
          }
          pendingFlushPaths.push(track.path)
          flushPendingMeta(false)
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(parseWorkers, parseQueue.length) }, () =>
          parseNextTrack()
        )
      )
      flushPendingMeta(true)

      for (const track of parseQueue) {
        if (track?.path) albumCoverProbePathsRef.current.add(track.path)
      }

      if (!cancelled && Object.keys(loaded).length > 0) {
        const parsedAlbumCovers = {}
        for (const track of parseQueue) {
          const loadedEntry = loaded[track.path]
          if (!loadedEntry?.cover) continue
          const albumName = loadedEntry.album || track?.info?.album || 'Singles'
          if (albumName && !parsedAlbumCovers[albumName]) {
            parsedAlbumCovers[albumName] = {
              cover: loadedEntry.cover,
              artist: loadedEntry.albumArtist || loadedEntry.artist || track?.info?.artist || ''
            }
          }
        }
        if (Object.keys(parsedAlbumCovers).length > 0) {
          persistAlbumCoverCacheItems(
            Object.entries(parsedAlbumCovers).map(([albumName, entry]) => ({
              album: albumName,
              artist: entry.artist,
              cover: entry.cover
            }))
          )
          setAlbumCoverMap((prev) => {
            let changed = false
            const next = { ...prev }
            for (const [albumName, entry] of Object.entries(parsedAlbumCovers)) {
              const cover = entry.cover
              if (!next[albumName] && cover) {
                next[albumName] = cover
                changed = true
              }
            }
            return changed ? next : prev
          })
        }

        setTrackMetaMap((prev) => {
          const merged = mergeTrackMetaMapPreservingCovers(prev, loaded)
          return trimTrackMetaCoverEntries(merged, metadataCoverKeepPathSet)
        })
      }

      const freshLoaded = {}
      for (const track of parseQueue) {
        if (loaded[track.path]) {
          freshLoaded[track.path] = mergeTrackMetaEntryPreservingCover(
            trackMetaMapRef.current?.[track.path] || {},
            loaded[track.path]
          )
        }
      }
      if (Object.keys(freshLoaded).length > 0) {
        writeTrackMetaCache(freshLoaded)
      }
    }

    loadMetadata()

    return () => {
      cancelled = true
    }
  }, [
    currentTrack?.path,
    isPlaying,
    listMode,
    metadataCoverKeepPathSet,
    metadataPrefetchTracks,
    persistAlbumCoverCacheItems,
    selectedAlbum,
    trackMetaMap
  ])

  useEffect(() => {
    if (listMode !== 'album' || selectedAlbum !== 'all') return undefined
    if (!metadataPrefetchAlbumGroups.length) return undefined

    const candidates = []
    for (const album of metadataPrefetchAlbumGroups) {
      const albumName = String(album?.name || '').trim()
      if (!albumName || album?.cover || albumCoverMap[albumName]) continue

      const representativeTrack =
        album.tracks.find((track) => trackMetaMap[track.path]?.coverChecked === true) ||
        album.tracks.find((track) => albumCoverProbePathsRef.current.has(track.path)) ||
        null
      if (!representativeTrack?.path) continue

      const artist =
        album.artist ||
        albumArtistByName[albumName] ||
        representativeTrack.info?.artist ||
        trackMetaMap[representativeTrack.path]?.artist ||
        ''
      const key = `${normalizeCoverLookupText(albumName)}::${normalizeCoverLookupText(artist)}`
      if (!key || albumCloudCoverAttemptedRef.current.has(key)) continue
      if (albumCloudCoverPendingRef.current.has(key)) continue

      candidates.push({ albumName, artist, key, track: representativeTrack })
      if (candidates.length >= ALBUM_CLOUD_COVER_PREFETCH_LIMIT) break
    }

    if (!candidates.length) return undefined
    let cancelled = false
    let nextIndex = 0

    const applyCloudAlbumCover = (candidate, cover) => {
      if (!cover) return
      setAlbumCoverMap((prev) => {
        if (prev[candidate.albumName]) return prev
        return { ...prev, [candidate.albumName]: cover }
      })
      persistAlbumCoverCacheItems({
        album: candidate.albumName,
        artist: candidate.artist || '',
        cover
      })

      const currentEntry = trackMetaMapRef.current?.[candidate.track.path] || {}
      const info = parseTrackInfo(candidate.track, currentEntry)
      const cacheEntry = {
        ...currentEntry,
        title: currentEntry.title || info.title || null,
        artist: currentEntry.artist || info.artist || candidate.artist || null,
        album: currentEntry.album || candidate.albumName,
        albumArtist: currentEntry.albumArtist || null,
        trackNo: currentEntry.trackNo ?? info.trackNo ?? null,
        discNo: currentEntry.discNo ?? info.discNo ?? null,
        duration: currentEntry.duration || info.duration || null,
        cover,
        coverChecked: true
      }

      setTrackMetaMap((prev) => {
        const existing = prev[candidate.track.path] || {}
        if (existing.cover) return prev
        return {
          ...prev,
          [candidate.track.path]: {
            ...existing,
            ...cacheEntry
          }
        }
      })
      writeTrackMetaCache({ [candidate.track.path]: cacheEntry })
    }

    const runNext = async () => {
      while (!cancelled) {
        const candidate = candidates[nextIndex]
        nextIndex += 1
        if (!candidate) return

        albumCloudCoverAttemptedRef.current.add(candidate.key)
        albumCloudCoverPendingRef.current.add(candidate.key)
        try {
          const cover = await fetchCloudAlbumCover(candidate.albumName, candidate.artist)
          applyCloudAlbumCover(candidate, cover)
        } finally {
          albumCloudCoverPendingRef.current.delete(candidate.key)
        }
      }
    }

    Promise.all(
      Array.from({ length: Math.min(ALBUM_CLOUD_COVER_WORKERS, candidates.length) }, () =>
        runNext()
      )
    ).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [
    albumArtistByName,
    albumCoverMap,
    listMode,
    metadataPrefetchAlbumGroups,
    persistAlbumCoverCacheItems,
    selectedAlbum,
    trackMetaMap
  ])

  const renameScopeLabel = useMemo(() => {
    if (listMode === 'playlists' && selectedUserPlaylist) return selectedUserPlaylist.name
    if (listMode === 'playlists' && selectedSmartCollection) return selectedSmartCollection.name
    if (listMode === 'folders' && selectedFolderGroup?.name) return selectedFolderGroup.name
    if (listMode === 'album' && selectedAlbum) return selectedAlbum
    if (listMode === 'folders') return t('listMode.folders')
    if (listMode === 'album') return t('listMode.albums')
    return t('listMode.songs')
  }, [
    listMode,
    selectedUserPlaylist,
    selectedSmartCollection,
    selectedFolderGroup,
    selectedAlbum,
    t
  ])

  const forceCloseTrackContextMenu = useCallback(() => {
    if (ctxMenuCloseTimerRef.current) {
      clearTimeout(ctxMenuCloseTimerRef.current)
      ctxMenuCloseTimerRef.current = null
    }
    setCtxMenuVisualOpen(false)
    setTrackContextMenu(null)
  }, [])

  const closeTrackContextMenuAnimated = useCallback(() => {
    setCtxMenuVisualOpen(false)
    if (ctxMenuCloseTimerRef.current) clearTimeout(ctxMenuCloseTimerRef.current)
    ctxMenuCloseTimerRef.current = window.setTimeout(() => {
      setTrackContextMenu(null)
      ctxMenuCloseTimerRef.current = null
    }, MENU_ANIM_MS)
  }, [])

  const forceCloseCoverContextMenu = useCallback(() => {
    if (coverCtxCloseTimerRef.current) {
      clearTimeout(coverCtxCloseTimerRef.current)
      coverCtxCloseTimerRef.current = null
    }
    setCoverCtxVisualOpen(false)
    setCoverContextMenu(null)
  }, [])

  const closeCoverContextMenuAnimated = useCallback(() => {
    setCoverCtxVisualOpen(false)
    if (coverCtxCloseTimerRef.current) clearTimeout(coverCtxCloseTimerRef.current)
    coverCtxCloseTimerRef.current = window.setTimeout(() => {
      setCoverContextMenu(null)
      coverCtxCloseTimerRef.current = null
    }, MENU_ANIM_MS)
  }, [])

  const forceCloseGroupContextMenu = useCallback(() => {
    if (groupCtxCloseTimerRef.current) {
      clearTimeout(groupCtxCloseTimerRef.current)
      groupCtxCloseTimerRef.current = null
    }
    setGroupCtxVisualOpen(false)
    setGroupContextMenu(null)
  }, [])

  const closeGroupContextMenuAnimated = useCallback(() => {
    setGroupCtxVisualOpen(false)
    if (groupCtxCloseTimerRef.current) clearTimeout(groupCtxCloseTimerRef.current)
    groupCtxCloseTimerRef.current = window.setTimeout(() => {
      setGroupContextMenu(null)
      groupCtxCloseTimerRef.current = null
    }, MENU_ANIM_MS)
  }, [])

  const forceCloseAddToPlaylistMenu = useCallback(() => {
    if (addPlCloseTimerRef.current) {
      clearTimeout(addPlCloseTimerRef.current)
      addPlCloseTimerRef.current = null
    }
    setAddPlVisualOpen(false)
    setAddToPlaylistMenu(null)
  }, [])

  const closeAddToPlaylistAnimated = useCallback(() => {
    setAddPlVisualOpen(false)
    if (addPlCloseTimerRef.current) clearTimeout(addPlCloseTimerRef.current)
    addPlCloseTimerRef.current = window.setTimeout(() => {
      setAddToPlaylistMenu(null)
      addPlCloseTimerRef.current = null
    }, MENU_ANIM_MS)
  }, [])

  const handleListMode = useCallback(
    (mode) => {
      startTransition(() => {
        forceCloseTrackContextMenu()
        forceCloseCoverContextMenu()
        forceCloseGroupContextMenu()
        setSelectedSidebarTrackPaths([])
        lastSelectedSidebarTrackPathRef.current = ''
        setListMode(mode)
        if (mode === 'playlists') {
          setSelectedUserPlaylistId(null)
          setSelectedSmartCollectionId(null)
          setSelectedArtist('all')
          setSelectedAlbum('all')
          setSelectedFolder('all')
        } else {
          setSelectedUserPlaylistId(null)
          setSelectedSmartCollectionId(null)
          setPlaylistLibraryMoreOpen(false)
        }
        if (mode !== 'artists') {
          setSelectedArtist('all')
        }
        if (mode === 'artists') {
          setSelectedAlbum('all')
          setSelectedFolder('all')
        }
        forceCloseAddToPlaylistMenu()
      })
    },
    [
      forceCloseTrackContextMenu,
      forceCloseCoverContextMenu,
      forceCloseGroupContextMenu,
      forceCloseAddToPlaylistMenu
    ]
  )

  useEffect(() => {
    if (listMode === 'history' && config.historyShowInSidebar === false) {
      setListMode('songs')
    }
  }, [config.historyShowInSidebar, listMode])

  const handlePickAlbumFromSidebar = useCallback(
    (album) => {
      albumOverviewScrollTopRef.current = sidebarPlaylistRef.current?.scrollTop || 0
      pendingAlbumOverviewRestoreRef.current = false
      pendingAlbumDetailScrollResetRef.current = true
      forceCloseTrackContextMenu()
      forceCloseCoverContextMenu()
      forceCloseGroupContextMenu()
      forceCloseAddToPlaylistMenu()
      setSelectedUserPlaylistId(null)
      setSelectedSmartCollectionId(null)
      setPlaylistLibraryMoreOpen(false)
      setSelectedArtist('all')
      setSelectedAlbum(album.name)
      setListMode('album')
    },
    [
      forceCloseTrackContextMenu,
      forceCloseCoverContextMenu,
      forceCloseGroupContextMenu,
      forceCloseAddToPlaylistMenu
    ]
  )

  const handleLocateTrackAlbum = useCallback(
    (track) => {
      if (!track) return
      const info = parseTrackInfo(track, trackMetaMap[track?.path] || null)
      const albumName =
        (info?.album && String(info.album).trim()) ||
        (track?.info?.album && String(track.info.album).trim()) ||
        'Singles'
      if (!albumName) return

      albumOverviewScrollTopRef.current = sidebarPlaylistRef.current?.scrollTop || 0
      pendingAlbumOverviewRestoreRef.current = false
      pendingAlbumDetailScrollResetRef.current = true
      forceCloseTrackContextMenu()
      forceCloseCoverContextMenu()
      forceCloseGroupContextMenu()
      forceCloseAddToPlaylistMenu()
      setSelectedUserPlaylistId(null)
      setSelectedSmartCollectionId(null)
      setPlaylistLibraryMoreOpen(false)
      setSelectedArtist('all')
      setSelectedFolder('all')
      setSelectedAlbum(albumName)
      setListMode('album')
    },
    [
      forceCloseTrackContextMenu,
      forceCloseCoverContextMenu,
      forceCloseGroupContextMenu,
      forceCloseAddToPlaylistMenu,
      trackMetaMap
    ]
  )

  const handleBackToAlbumOverview = useCallback(() => {
    pendingAlbumOverviewRestoreRef.current = true
    setSelectedAlbum('all')
  }, [])

  useLayoutEffect(() => {
    if (
      !pendingAlbumDetailScrollResetRef.current ||
      listMode !== 'album' ||
      selectedAlbum === 'all'
    ) {
      return
    }

    const playlistElement = sidebarPlaylistRef.current
    if (playlistElement) {
      playlistElement.scrollTop = 0
    }
    setSidebarScrollTop(0)
    pendingAlbumDetailScrollResetRef.current = false
  }, [listMode, selectedAlbum])

  const handlePickFolderFromSidebar = useCallback((folder) => {
    setSelectedFolder(folder.folderPath)
    setSelectedAlbum('all')
    setSelectedArtist('all')
    setSelectedSmartCollectionId(null)
    setListMode('folders')
  }, [])

  const handlePickArtistFromSidebar = useCallback(
    (artist) => {
      if (!artist?.name) return
      if (artistDetailLeaveTimerRef.current) {
        window.clearTimeout(artistDetailLeaveTimerRef.current)
        artistDetailLeaveTimerRef.current = null
      }
      setArtistDetailLeaving(false)
      selectedArtistTracksRef.current = {
        name: artist.name,
        tracks: Array.isArray(artist.tracks) ? artist.tracks : [],
        source: queryFilteredPlaylist
      }
      setSelectedArtist(artist.name)
      setSelectedAlbum('all')
      setSelectedFolder('all')
      setSelectedUserPlaylistId(null)
      setSelectedSmartCollectionId(null)
      setPlaylistLibraryMoreOpen(false)
      setListMode('artists')
    },
    [queryFilteredPlaylist]
  )

  const handleBackToArtistOverview = useCallback(() => {
    if (artistDetailLeaveTimerRef.current) return
    setArtistDetailLeaving(true)
    artistDetailLeaveTimerRef.current = window.setTimeout(() => {
      selectedArtistTracksRef.current = { name: '', tracks: [], source: null }
      setSelectedArtist('all')
      setArtistDetailLeaving(false)
      artistDetailLeaveTimerRef.current = null
    }, ARTIST_DETAIL_RETURN_ANIMATION_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (artistDetailLeaveTimerRef.current) {
        window.clearTimeout(artistDetailLeaveTimerRef.current)
      }
    }
  }, [])

  const handleBackToFolderParent = useCallback(() => {
    setSelectedFolder((current) => {
      if (!current || current === 'all') return 'all'
      const currentGroup = folderGroupsFiltered.find((folder) => folder.folderPath === current)
      return currentGroup?.parentPath || 'all'
    })
  }, [folderGroupsFiltered])

  useEffect(() => {
    const hasOpenFloatingUi =
      !!addToPlaylistMenu ||
      !!trackContextMenu ||
      !!coverContextMenu ||
      !!groupContextMenu ||
      playlistLibraryMoreOpen ||
      folderSortOpen ||
      songSortOpen ||
      artistSortOpen ||
      activeDeckPopover

    if (showLyrics || view === 'settings' || hasOpenFloatingUi) return undefined

    const onKey = (event) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey) return

      if (listMode === 'album' && selectedAlbum !== 'all') {
        event.preventDefault()
        handleBackToAlbumOverview()
      } else if (listMode === 'artists' && selectedArtist !== 'all') {
        event.preventDefault()
        handleBackToArtistOverview()
      } else if (listMode === 'folders' && selectedFolder !== 'all') {
        event.preventDefault()
        handleBackToFolderParent()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    activeDeckPopover,
    addToPlaylistMenu,
    coverContextMenu,
    folderSortOpen,
    groupContextMenu,
    handleBackToAlbumOverview,
    handleBackToArtistOverview,
    handleBackToFolderParent,
    listMode,
    playlistLibraryMoreOpen,
    selectedAlbum,
    selectedArtist,
    selectedFolder,
    showLyrics,
    songSortOpen,
    artistSortOpen,
    trackContextMenu,
    view
  ])

  const handleOpenImportedFolder = useCallback((folder) => {
    if (!folder?.path) return
    setSelectedFolder(folder.path)
    setSelectedAlbum('all')
    setSelectedArtist('all')
    setSelectedUserPlaylistId(null)
    setSelectedSmartCollectionId(null)
    setPlaylistLibraryMoreOpen(false)
    setListMode('folders')
  }, [])

  const handleRemoveImportedFolder = useCallback(
    (folder) => {
      const folderPath = normalizeImportedFolderPath(folder?.path)
      if (!folderPath) return
      const folderName = getPathBasename(folderPath) || folderPath
      const ok = window.confirm(
        t('folders.confirmRemoveImportedFolder', {
          name: folderName,
          defaultValue: `Remove imported folder "${folderName}" from ECHO?`
        })
      )
      if (!ok) return

      const removedPaths = playlistRef.current
        .filter((track) => isTrackInsideImportedFolders(track?.path, [folderPath]))
        .map((track) => track.path)

      setImportedFolders((prev) =>
        prev.filter(
          (item) => normalizeImportedFolderPath(item).toLowerCase() !== folderPath.toLowerCase()
        )
      )
      if (selectedFolder === folderPath) setSelectedFolder('all')
      if (removedPaths.length > 0) {
        applyLibraryFolderDelta({ renamed: [], removedPaths, added: [] })
      }
    },
    [applyLibraryFolderDelta, selectedFolder, t]
  )

  const openUserPlaylist = useCallback((playlistId) => {
    setSelectedSmartCollectionId(null)
    setSelectedUserPlaylistId(playlistId)
    setSelectedArtist('all')
    setSelectedAlbum('all')
    setSelectedFolder('all')
    setListMode('playlists')
  }, [])

  const openSmartCollection = useCallback((collectionId) => {
    setSelectedUserPlaylistId(null)
    setSelectedSmartCollectionId(collectionId)
    setSelectedArtist('all')
    setListMode('playlists')
  }, [])

  const resetSmartCollectionEditor = useCallback(() => {
    setSmartCollectionDraft(
      createSmartCollectionDraft({ rules: createEmptySmartCollectionRules() })
    )
    setEditingSmartCollectionId(null)
    setSmartCollectionEditorOpen(false)
  }, [])

  const openCreateSmartCollectionEditor = useCallback(() => {
    setEditingSmartCollectionId(null)
    setSmartCollectionDraft(
      createSmartCollectionDraft({ rules: createEmptySmartCollectionRules() })
    )
    setSmartCollectionEditorOpen(true)
  }, [])

  const openEditSmartCollectionEditor = useCallback(
    (collectionId) => {
      const target = userSmartCollections.find((item) => item.id === collectionId)
      if (!target) return
      setEditingSmartCollectionId(collectionId)
      setSmartCollectionDraft(createSmartCollectionDraft(target))
      setSmartCollectionEditorOpen(true)
      setSelectedUserPlaylistId(null)
      setSelectedSmartCollectionId(null)
      setListMode('playlists')
    },
    [userSmartCollections]
  )

  const createSmartCollectionFromDraft = useCallback(
    (draft, options = {}) => {
      const normalized = normalizeSmartCollectionDraft(draft)
      if (!normalized.name) {
        alert(t('playlists.smartNameRequired', 'Enter a name for the smart collection.'))
        return false
      }
      if (!hasActiveSmartCollectionRules(normalized.rules)) {
        alert(
          t(
            'playlists.smartRulesRequired',
            'Add at least one rule so this smart collection knows what to match.'
          )
        )
        return false
      }

      const nextId = options.id || crypto.randomUUID()
      const finalName = options.keepName
        ? normalized.name
        : createUniqueSmartCollectionName(normalized.name, userSmartCollections)
      setUserSmartCollections((prev) => {
        const nextItem = { id: nextId, name: finalName, rules: normalized.rules }
        if (options.id) return prev.map((item) => (item.id === options.id ? nextItem : item))
        return [...prev, nextItem]
      })
      setSelectedUserPlaylistId(null)
      setSelectedSmartCollectionId(nextId)
      setListMode('playlists')
      return true
    },
    [t, userSmartCollections]
  )

  const applySmartCollectionTemplate = useCallback(
    (templateBuilder) => {
      setEditingSmartCollectionId(null)
      setSmartCollectionEditorOpen(false)
      createSmartCollectionFromDraft(templateBuilder())
    },
    [createSmartCollectionFromDraft]
  )

  const saveSmartCollectionDraft = useCallback(() => {
    const ok = createSmartCollectionFromDraft(smartCollectionDraft, {
      id: editingSmartCollectionId || null,
      keepName: Boolean(editingSmartCollectionId)
    })
    if (ok) resetSmartCollectionEditor()
  }, [
    smartCollectionDraft,
    editingSmartCollectionId,
    createSmartCollectionFromDraft,
    resetSmartCollectionEditor
  ])

  const deleteSmartCollection = useCallback(
    (id) => {
      if (!confirm(t('playlists.confirmDeleteSmartCollection', 'Delete this smart collection?'))) {
        return
      }
      setUserSmartCollections((prev) => prev.filter((item) => item.id !== id))
      setSelectedSmartCollectionId((cur) => (cur === id ? null : cur))
      if (editingSmartCollectionId === id) {
        resetSmartCollectionEditor()
      }
    },
    [editingSmartCollectionId, resetSmartCollectionEditor, t]
  )

  const openGroupContextMenu = useCallback(
    (e, type, group) => {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      const { clientX, clientY } = resolveContextMenuPoint(e)
      setFolderSortOpen(false)
      forceCloseAddToPlaylistMenu()
      forceCloseTrackContextMenu()
      forceCloseCoverContextMenu()
      setGroupContextMenu({
        clientX,
        clientY,
        type,
        group
      })
    },
    [forceCloseAddToPlaylistMenu, forceCloseTrackContextMenu, forceCloseCoverContextMenu]
  )

  const openCoverContextMenu = useCallback(
    (e) => {
      if (!currentTrack) return
      e?.preventDefault?.()
      e?.stopPropagation?.()
      const { clientX, clientY } = resolveContextMenuPoint(e)
      forceCloseCoverContextMenu()
      forceCloseAddToPlaylistMenu()
      forceCloseTrackContextMenu()
      forceCloseGroupContextMenu()
      setCoverContextMenu({
        clientX,
        clientY,
        track: currentTrack
      })
    },
    [
      currentTrack,
      forceCloseCoverContextMenu,
      forceCloseAddToPlaylistMenu,
      forceCloseTrackContextMenu,
      forceCloseGroupContextMenu
    ]
  )

  const playGroupNow = useCallback(
    async (type, group) => {
      const firstTrack = group?.tracks?.[0]
      if (!firstTrack) return
      const groupKey = type === 'album' ? group?.name || 'album' : group?.folderPath || 'folder'
      const playbackContext = createPlaybackContext(
        type === 'album' ? 'albumGroup' : 'folderGroup',
        groupKey,
        (group?.tracks || []).map((track) => track.path)
      )
      if (type === 'album') {
        handlePickAlbumFromSidebar(group)
      } else if (type === 'folder') {
        handlePickFolderFromSidebar(group)
      }
      await stopCastBeforeLocalPlayback()
      setActivePlaybackContext(playbackContext)
      setCurrentIndex(firstTrack.originalIdx)
      setIsPlaying(true)
      closeGroupContextMenuAnimated()
    },
    [
      handlePickAlbumFromSidebar,
      handlePickFolderFromSidebar,
      stopCastBeforeLocalPlayback,
      closeGroupContextMenuAnimated
    ]
  )

  const queueGroupNext = useCallback(
    (group) => {
      enqueueUpNextTracks(group?.tracks || [])
      closeGroupContextMenuAnimated()
    },
    [enqueueUpNextTracks, closeGroupContextMenuAnimated]
  )

  const revealGroupInExplorer = useCallback(
    async (type, group) => {
      try {
        if (type === 'folder' && isLocalAudioFilePath(group?.folderPath) && window.api?.openPath) {
          const r = await window.api.openPath(group.folderPath)
          if (r && r.ok === false && r.error) {
            alert(t('contextMenu.actionFailed', { detail: r.error }))
          }
          closeGroupContextMenuAnimated()
          return
        }

        const firstLocalTrack = (group?.tracks || []).find((track) =>
          isLocalAudioFilePath(track?.path)
        )
        if (!firstLocalTrack?.path || !window.api?.showItemInFolder) {
          alert(t('contextMenu.actionFailed', { detail: 'path_unavailable' }))
          return
        }

        const r = await window.api.showItemInFolder(firstLocalTrack.path)
        if (r && r.ok === false && r.error) {
          alert(t('contextMenu.actionFailed', { detail: r.error }))
        }
      } catch (err) {
        alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
      }
      closeGroupContextMenuAnimated()
    },
    [closeGroupContextMenuAnimated, t]
  )

  const writeTextToClipboard = useCallback(
    async (text) => {
      try {
        if (window.api?.writeClipboardText) {
          const r = await window.api.writeClipboardText(text)
          if (r && r.ok === false && r.error) {
            alert(t('contextMenu.actionFailed', { detail: r.error }))
          }
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          alert(t('contextMenu.actionFailed', { detail: 'clipboard_unavailable' }))
        }
      } catch (err) {
        alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
      }
    },
    [t]
  )

  const revealTrackInFolder = useCallback(
    async (track) => {
      const path = track?.path
      if (!path || !window.api?.showItemInFolder) {
        alert(t('contextMenu.actionFailed', { detail: 'path_unavailable' }))
        return
      }
      try {
        const r = await window.api.showItemInFolder(path)
        if (r && r.ok === false && r.error) {
          alert(t('contextMenu.actionFailed', { detail: r.error }))
        }
      } catch (err) {
        alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
      }
    },
    [t]
  )

  const openTrackWithDefaultApp = useCallback(
    async (track) => {
      const path = track?.path
      if (!path || !window.api?.openPath) {
        alert(t('contextMenu.actionFailed', { detail: 'path_unavailable' }))
        return
      }
      try {
        const r = await window.api.openPath(path)
        if (r && r.ok === false && r.error) {
          alert(t('contextMenu.actionFailed', { detail: r.error }))
        }
      } catch (err) {
        alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
      }
    },
    [t]
  )

  const addPathToUserPlaylist = useCallback(
    (playlistId, path) => {
      if (!path) return
      setUserPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? {
                ...p,
                paths: p.paths.includes(path) ? p.paths : [...p.paths, path]
              }
            : p
        )
      )
      closeAddToPlaylistAnimated()
    },
    [closeAddToPlaylistAnimated]
  )

  const addSmartCollectionToUserPlaylist = useCallback(
    (playlistId, collectionId) => {
      if (!playlistId || !collectionId) return
      const collection = smartCollections.find((item) => item.id === collectionId)
      const paths = (collection?.tracks || []).map((track) => track.path).filter(Boolean)
      if (paths.length === 0) return
      setUserPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, paths: [...new Set([...p.paths, ...paths])] } : p
        )
      )
    },
    [smartCollections]
  )

  const createPlaylistFromSmartCollection = useCallback(
    (collectionId) => {
      if (!collectionId) return
      const collection = smartCollections.find((item) => item.id === collectionId)
      const paths = (collection?.tracks || []).map((track) => track.path).filter(Boolean)
      if (!collection || paths.length === 0) return
      const id = crypto.randomUUID()
      const name = createUniquePlaylistName(collection.name, userPlaylistsRef.current)
      setUserPlaylists((prev) => [...prev, { id, name, paths: [...new Set(paths)] }])
      openUserPlaylist(id)
    },
    [openUserPlaylist, smartCollections]
  )

  const getSmartCollectionDragId = useCallback((e) => {
    return (
      e.dataTransfer.getData('application/x-echo-smart-collection-id') ||
      e.dataTransfer.getData('text/x-echo-smart-collection-id')
    )
  }, [])

  const handleSmartCollectionDragOver = useCallback((e) => {
    const dragTypes = Array.from(e.dataTransfer?.types || [])
    if (
      dragTypes.includes('application/x-echo-smart-collection-id') ||
      dragTypes.includes('text/x-echo-smart-collection-id')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleSmartCollectionDropToPlaylist = useCallback(
    (e, playlistId) => {
      const collectionId = getSmartCollectionDragId(e)
      if (!collectionId) return
      e.preventDefault()
      e.stopPropagation()
      addSmartCollectionToUserPlaylist(playlistId, collectionId)
    },
    [addSmartCollectionToUserPlaylist, getSmartCollectionDragId]
  )

  const handleSmartCollectionDropToLibrary = useCallback(
    (e) => {
      const collectionId = getSmartCollectionDragId(e)
      if (!collectionId) return
      e.preventDefault()
      e.stopPropagation()
      createPlaylistFromSmartCollection(collectionId)
    },
    [createPlaylistFromSmartCollection, getSmartCollectionDragId]
  )

  const removePathFromUserPlaylist = useCallback((playlistId, path) => {
    setUserPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlistId ? { ...p, paths: p.paths.filter((x) => x !== path) } : p
      )
    )
  }, [])

  const submitNewPlaylistFromToolbar = useCallback(() => {
    const name = newPlaylistName.trim()
    if (!name) {
      newPlaylistInputRef.current?.focus()
      return
    }
    const id = crypto.randomUUID()
    setUserPlaylists((prev) => [...prev, { id, name, paths: [] }])
    setNewPlaylistName('')
    openUserPlaylist(id)
  }, [newPlaylistName, openUserPlaylist])

  const updateSmartCollectionDraftField = useCallback((field, value) => {
    setSmartCollectionDraft((prev) => ({ ...prev, [field]: value }))
  }, [])

  const openAddToPlaylistPopover = useCallback(
    (e, track) => {
      e.stopPropagation()
      forceCloseTrackContextMenu()
      forceCloseGroupContextMenu()
      if (addToPlaylistMenu?.originalIdx === track.originalIdx) {
        closeAddToPlaylistAnimated()
        return
      }
      const r = e.currentTarget.getBoundingClientRect()
      const w = 268
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
      const menuH = 300
      let top = r.bottom + 8
      if (top + menuH > window.innerHeight - 12) {
        top = Math.max(12, r.top - menuH - 8)
      }
      setAddToPlaylistMenu({
        originalIdx: track.originalIdx,
        path: track.path,
        top,
        left,
        width: w
      })
    },
    [
      addToPlaylistMenu,
      forceCloseTrackContextMenu,
      forceCloseGroupContextMenu,
      closeAddToPlaylistAnimated
    ]
  )

  const openAddToPlaylistAtPoint = useCallback(
    (clientX, clientY, track) => {
      const w = 268
      const left = Math.max(8, Math.min(clientX, window.innerWidth - w - 8))
      const menuH = 300
      let top = clientY + 4
      if (top + menuH > window.innerHeight - 12) {
        top = Math.max(12, clientY - menuH - 4)
      }
      forceCloseTrackContextMenu()
      forceCloseGroupContextMenu()
      setAddToPlaylistMenu({
        originalIdx: track.originalIdx,
        path: track.path,
        top,
        left,
        width: w
      })
    },
    [forceCloseTrackContextMenu, forceCloseGroupContextMenu]
  )

  const createPlaylistAndAddTrackFromPopover = useCallback(() => {
    const name = quickNewPlaylistName.trim()
    if (!name || !addToPlaylistMenu?.path) return
    const id = crypto.randomUUID()
    setUserPlaylists((prev) => [...prev, { id, name, paths: [addToPlaylistMenu.path] }])
    closeAddToPlaylistAnimated()
    setQuickNewPlaylistName('')
  }, [quickNewPlaylistName, addToPlaylistMenu, closeAddToPlaylistAnimated])

  useEffect(() => {
    if (!addToPlaylistMenu) {
      setQuickNewPlaylistName('')
      setAddPlVisualOpen(false)
      return
    }
    if (addPlCloseTimerRef.current) {
      clearTimeout(addPlCloseTimerRef.current)
      addPlCloseTimerRef.current = null
    }
    setAddPlVisualOpen(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setAddPlVisualOpen(true))
    })
    const onKey = (e) => {
      if (e.key === 'Escape') closeAddToPlaylistAnimated()
    }
    const onResize = () => forceCloseAddToPlaylistMenu()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    document.addEventListener('scroll', onResize, true)
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('scroll', onResize, true)
    }
  }, [addToPlaylistMenu, closeAddToPlaylistAnimated, forceCloseAddToPlaylistMenu])

  useEffect(() => {
    if (!trackContextMenu) {
      setCtxMenuVisualOpen(false)
      return
    }
    if (ctxMenuCloseTimerRef.current) {
      clearTimeout(ctxMenuCloseTimerRef.current)
      ctxMenuCloseTimerRef.current = null
    }
    setCtxMenuVisualOpen(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setCtxMenuVisualOpen(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [trackContextMenu])

  useEffect(() => {
    if (!coverContextMenu) {
      setCoverCtxVisualOpen(false)
      return
    }
    if (coverCtxCloseTimerRef.current) {
      clearTimeout(coverCtxCloseTimerRef.current)
      coverCtxCloseTimerRef.current = null
    }
    setCoverCtxVisualOpen(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setCoverCtxVisualOpen(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [coverContextMenu])

  useEffect(() => {
    if (!groupContextMenu) {
      setGroupCtxVisualOpen(false)
      return
    }
    if (groupCtxCloseTimerRef.current) {
      clearTimeout(groupCtxCloseTimerRef.current)
      groupCtxCloseTimerRef.current = null
    }
    setGroupCtxVisualOpen(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setGroupCtxVisualOpen(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [groupContextMenu])

  useEffect(() => {
    if (!trackContextMenu) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeTrackContextMenuAnimated()
    }
    const onPointerDown = (e) => {
      const el = trackContextMenuRef.current
      if (el && !el.contains(e.target)) closeTrackContextMenuAnimated()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [trackContextMenu, closeTrackContextMenuAnimated])

  useEffect(() => {
    if (!coverContextMenu) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeCoverContextMenuAnimated()
    }
    const onPointerDown = (e) => {
      const el = coverContextMenuRef.current
      if (el && !el.contains(e.target)) closeCoverContextMenuAnimated()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [coverContextMenu, closeCoverContextMenuAnimated])

  useEffect(() => {
    if (!groupContextMenu) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeGroupContextMenuAnimated()
    }
    const onPointerDown = (e) => {
      const el = groupContextMenuRef.current
      if (el && !el.contains(e.target)) closeGroupContextMenuAnimated()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [groupContextMenu, closeGroupContextMenuAnimated])

  useEffect(() => {
    if (!playlistLibraryMoreOpen) return
    const onDocMouseDown = (e) => {
      if (playlistLibraryMoreRef.current && !playlistLibraryMoreRef.current.contains(e.target)) {
        setPlaylistLibraryMoreOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setPlaylistLibraryMoreOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [playlistLibraryMoreOpen])

  useEffect(() => {
    if (!folderSortOpen) return
    const onDocMouseDown = (e) => {
      if (folderSortRef.current && !folderSortRef.current.contains(e.target)) {
        setFolderSortOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setFolderSortOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [folderSortOpen])

  useEffect(() => {
    if (!songSortOpen) return
    const onDocMouseDown = (e) => {
      if (songSortRef.current && !songSortRef.current.contains(e.target)) {
        setSongSortOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setSongSortOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [songSortOpen])

  useEffect(() => {
    if (!artistSortOpen) return
    const onDocMouseDown = (e) => {
      if (artistSortRef.current && !artistSortRef.current.contains(e.target)) {
        setArtistSortOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setArtistSortOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [artistSortOpen])

  const deleteUserPlaylist = useCallback(
    (id) => {
      if (!confirm(t('playlists.confirmDelete'))) return
      setUserPlaylists((prev) => prev.filter((p) => p.id !== id))
      setSelectedUserPlaylistId((cur) => (cur === id ? null : cur))
    },
    [t]
  )

  const renameUserPlaylist = useCallback(
    (id) => {
      const pl = userPlaylists.find((p) => p.id === id)
      if (!pl) return
      const name = window.prompt(t('playlists.promptRename'), pl.name)
      if (!name || !String(name).trim()) return
      setUserPlaylists((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: String(name).trim() } : p))
      )
    },
    [userPlaylists, t]
  )

  const libraryTrackByPath = useMemo(() => {
    const next = Object.create(null)
    for (const track of playlist) {
      if (track?.path) next[track.path] = track
    }
    return next
  }, [playlist])

  const buildM3UTrackFromPath = useCallback(
    (trackPath) => {
      if (!trackPath || typeof trackPath !== 'string') return null
      const existingTrack = libraryTrackByPath[trackPath]
      const fallbackName = trackPath.split(/[/\\]/).pop() || trackPath
      const baseTrack = existingTrack || { path: trackPath, name: fallbackName }
      return {
        ...baseTrack,
        path: trackPath,
        info: parseTrackInfo(baseTrack, trackMetaMap[trackPath])
      }
    },
    [libraryTrackByPath, trackMetaMap]
  )

  const exportUserPlaylistM3U = useCallback(
    async (playlistId) => {
      const pl = userPlaylists.find((p) => p.id === playlistId)
      if (!pl) return
      const tracks = (pl.paths || []).map(buildM3UTrackFromPath).filter((track) => track?.path)
      const result = await window.api?.exportPlaylistM3U?.({
        tracks,
        suggestedName: pl.name || 'playlist'
      })
      if (result?.ok === false && !result.canceled && result.error) {
        alert(t('playlists.exportFailed', { message: result.error }))
      }
    },
    [buildM3UTrackFromPath, t, userPlaylists]
  )

  const exportUserPlaylistText = useCallback(
    async (playlistToExport) => {
      const pl =
        typeof playlistToExport === 'string'
          ? userPlaylists.find((item) => item.id === playlistToExport)
          : playlistToExport
      if (!pl) return
      const tracks = (pl.paths || []).map(buildM3UTrackFromPath).filter((track) => track?.path)
      if (!window.api?.exportPlaylistText) {
        alert(t('playlists.exportFailed', { message: 'exportPlaylistText IPC is unavailable' }))
        return
      }
      try {
        const result = await window.api.exportPlaylistText({
          tracks,
          suggestedName: pl.name || 'playlist'
        })
        if (result?.ok === false && !result.canceled && result.error) {
          alert(t('playlists.exportFailed', { message: result.error }))
        }
      } catch (error) {
        alert(t('playlists.exportFailed', { message: error?.message || String(error) }))
      }
    },
    [buildM3UTrackFromPath, t, userPlaylists]
  )

  const exportMainPlaylistM3U = useCallback(async () => {
    const tracks = playlist
      .map((track) => buildM3UTrackFromPath(track?.path))
      .filter((track) => track?.path)
    const result = await window.api?.exportPlaylistM3U?.({
      tracks,
      suggestedName: 'echo-playlist'
    })
    if (result?.ok === false && !result.canceled && result.error) {
      alert(t('playlists.exportFailed', { message: result.error }))
    }
  }, [buildM3UTrackFromPath, playlist, t])

  const buildExportTrackFromPath = useCallback(
    async (trackPath) => {
      if (!trackPath || typeof trackPath !== 'string') return null
      const existingTrack = libraryTrackByPath[trackPath]
      const fallbackName = trackPath.split(/[/\\]/).pop() || trackPath
      const baseTrack = existingTrack || { path: trackPath, name: fallbackName }
      const info = parseTrackInfo(baseTrack, trackMetaMap[trackPath])
      let sourceUrl =
        typeof existingTrack?.sourceUrl === 'string' && existingTrack.sourceUrl.trim()
          ? existingTrack.sourceUrl.trim()
          : typeof existingTrack?.mvOriginUrl === 'string' && existingTrack.mvOriginUrl.trim()
            ? existingTrack.mvOriginUrl.trim()
            : ''

      if (!sourceUrl && window.api?.readInfoJsonHandler) {
        const infoJson = await window.api.readInfoJsonHandler(trackPath).catch(() => null)
        const maybeUrl =
          (typeof infoJson?.webpage_url === 'string' && infoJson.webpage_url.trim()) ||
          (typeof infoJson?.original_url === 'string' && infoJson.original_url.trim()) ||
          (typeof infoJson?.url === 'string' && /^https?:\/\//i.test(infoJson.url)
            ? infoJson.url.trim()
            : '')
        if (maybeUrl) sourceUrl = maybeUrl
      }

      return {
        path: trackPath,
        title: info?.title || stripExtension(baseTrack.name || fallbackName) || fallbackName,
        artist: info?.artist && info.artist !== 'Unknown Artist' ? info.artist : '',
        ...(sourceUrl ? { sourceUrl } : {})
      }
    },
    [libraryTrackByPath, trackMetaMap]
  )

  const buildPlaylistsExportJson = useCallback(
    async (playlistsToExport) => {
      const enrichedPlaylists = await Promise.all(
        (playlistsToExport || []).map(async (playlistItem) => {
          const paths = Array.isArray(playlistItem?.paths) ? playlistItem.paths : []
          const tracks = (
            await Promise.all(paths.map((trackPath) => buildExportTrackFromPath(trackPath)))
          ).filter(Boolean)
          return {
            name: playlistItem?.name || 'Playlist',
            paths,
            tracks
          }
        })
      )
      return JSON.stringify(buildPlaylistsExportPayload(enrichedPlaylists), null, 2)
    },
    [buildExportTrackFromPath]
  )

  const exportNamedUserPlaylists = useCallback(
    async (playlistsToExport, defaultName) => {
      const json = await buildPlaylistsExportJson(playlistsToExport)
      const r = await window.api.saveThemeJsonHandler(json, defaultName, configRef.current.uiLocale)
      if (r && r.success === false && r.error) alert(r.error)
    },
    [buildPlaylistsExportJson]
  )

  const exportUserPlaylists = useCallback(async () => {
    await exportNamedUserPlaylists(userPlaylists, 'echoes-playlists.json')
  }, [exportNamedUserPlaylists, userPlaylists])

  const importUserPlaylists = useCallback(async () => {
    const r = window.api?.openPlaylistFileHandler
      ? await window.api.openPlaylistFileHandler()
      : await window.api.openThemeJsonHandler(configRef.current.uiLocale)
    if (r?.error) {
      alert(r.error)
      return
    }
    if (!r?.content) return
    try {
      if (/\.m3u8?$/i.test(r.path || '')) {
        await importM3UPlaylistFromText(r.content, r.path)
        return
      }
      const data = JSON.parse(r.content)
      const imported = normalizeImportedPlaylists(data)
      if (!imported.length) {
        alert(t('playlists.noPlaylistsInFile'))
        return
      }
      setUserPlaylists((prev) => [...prev, ...imported])
      setSelectedSmartCollectionId(null)
      setSelectedUserPlaylistId(imported[imported.length - 1]?.id || null)
    } catch (e) {
      alert(e.message || String(e))
    }
  }, [importM3UPlaylistFromText, t])

  const importAudioIntoSelectedUserPlaylist = async () => {
    if (!selectedUserPlaylistId) return
    const files = await window.api.openFileHandler(configRef.current.uiLocale)
    if (!files || files.length === 0) return
    const paths = await processFiles(files)
    if (paths.length === 0) return
    setUserPlaylists((prev) =>
      prev.map((p) =>
        p.id === selectedUserPlaylistId ? { ...p, paths: [...new Set([...p.paths, ...paths])] } : p
      )
    )
  }

  const discordPresencePositionBucket = Math.floor(Math.max(0, Number(currentTime) || 0) / 10)
  const discordPresenceSignatureRef = useRef('')

  useEffect(() => {
    if (!window.api?.setDiscordActivity) return

    if (!config.enableDiscordRPC || !config.showDiscordRPC) {
      discordPresenceSignatureRef.current = ''
      window.api.clearDiscordActivity()
      return
    }

    if (!currentTrack) {
      discordPresenceSignatureRef.current = ''
      window.api.clearDiscordActivity()
      return
    }

    const activity = buildDiscordPresenceActivity({
      track: currentTrack,
      title: displayMainTitle,
      artist:
        displayMainArtist && displayMainArtist !== t('player.nightcoreMode')
          ? displayMainArtist
          : currentTrackInfo?.artist || '',
      artistFallback: currentTrackInfo?.artist || currentTrack?.info?.artist || 'ECHO',
      isPlaying,
      playbackRate,
      coverUrl: displaySafeCoverUrl || coverUrl,
      currentTime,
      duration
    })
    const signature = buildDiscordPresenceSignature(activity)
    if (!activity || signature === discordPresenceSignatureRef.current) return

    discordPresenceSignatureRef.current = signature
    window.api.setDiscordActivity(activity)
  }, [
    currentTrack,
    currentTrackInfo,
    displayMainTitle,
    displayMainArtist,
    isPlaying,
    playbackRate,
    config.enableDiscordRPC,
    config.showDiscordRPC,
    displaySafeCoverUrl,
    coverUrl,
    duration,
    discordPresencePositionBucket,
    t
  ])

  // Sync Discord Toggle with Main Process
  useEffect(() => {
    if (window.api?.toggleDiscordRPC) {
      window.api.toggleDiscordRPC(config.enableDiscordRPC)
    }
  }, [config.enableDiscordRPC])

  // Compute inline style for lyrics panel when immersive MV background is enabled
  const isImmersiveLyricsMvVisible = Boolean(
    showLyrics && mvId && isImmersiveLyricsMvEnabled(config) && !isCurrentTrackMvTemporarilyHidden
  )

  const lyricsPanelStyle = React.useMemo(() => {
    if (!isImmersiveLyricsMvVisible) return {}

    const useShadow = config.lyricsShadow !== undefined ? config.lyricsShadow : true
    const opa = config.lyricsShadowOpacity !== undefined ? config.lyricsShadowOpacity : 0.6

    if (!useShadow) {
      return {
        background: 'transparent',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        border: 'none',
        boxShadow: 'none'
      }
    }

    // When shadow enabled, we used to show blur, but user wants it GONE for MV clarity.
    // We will only use a very faint dark gradient at the bottom/top if needed, or just transparent.
    return {
      background: 'transparent',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      border: 'none',
      boxShadow: 'none'
    }
  }, [isImmersiveLyricsMvVisible, config.lyricsShadow, config.lyricsShadowOpacity, config.uiBlur])

  const hideImmersiveMvChrome = useMemo(
    () =>
      isImmersiveLyricsMvVisible &&
      config.mvHideImmersiveChrome &&
      !isCurrentTrackMvTemporarilyHidden,
    [isImmersiveLyricsMvVisible, config.mvHideImmersiveChrome, isCurrentTrackMvTemporarilyHidden]
  )

  /** Full-bleed MV or custom wallpaper behind lyrics -need high-contrast chrome + lyric text */
  const brightLyricsBackdrop = useMemo(
    () => isImmersiveLyricsMvVisible,
    [isImmersiveLyricsMvVisible]
  )
  const themePaletteForLyricsBackground = useMemo(() => {
    const raw =
      config.themeDynamicCoverColor && dynamicCoverTheme
        ? dynamicCoverTheme
        : config.theme === 'custom' && config.customColors
          ? config.customColors
          : PRESET_THEMES[config.theme]?.colors || PRESET_THEMES.minimal.colors
    return normalizeThemeColors(raw)
  }, [config.theme, config.customColors, config.themeDynamicCoverColor, dynamicCoverTheme])
  const lyricsDockPresentation = useMemo(() => {
    if (!showLyrics) return null
    return buildLyricsBackgroundPresentation({
      mode: config.lyricsBackgroundMode,
      customColor: config.lyricsBackgroundColor,
      wallpaperUrl: lyricsWallpaperUrl,
      wallpaperOpacity: config.lyricsBackgroundWallpaperOpacity,
      wallpaperBlur: config.lyricsBackgroundWallpaperBlur,
      coverUrl: displaySafeCoverUrl,
      coverPalette: dynamicCoverTheme,
      themePalette: themePaletteForLyricsBackground
    })
  }, [
    showLyrics,
    config.lyricsBackgroundMode,
    config.lyricsBackgroundColor,
    config.lyricsBackgroundWallpaperOpacity,
    config.lyricsBackgroundWallpaperBlur,
    lyricsWallpaperUrl,
    displaySafeCoverUrl,
    dynamicCoverTheme,
    themePaletteForLyricsBackground
  ])
  const lyricsBackgroundPresentation = useMemo(() => {
    if (brightLyricsBackdrop) return null
    return lyricsDockPresentation
  }, [brightLyricsBackdrop, lyricsDockPresentation])
  const showLyricsFluidBackground =
    config.lyricsFluidBackground !== false &&
    showLyrics &&
    !brightLyricsBackdrop &&
    Boolean(dynamicCoverTheme) &&
    (config.themeDynamicCoverColor ||
      normalizeLyricsBackgroundMode(config.lyricsBackgroundMode) === 'cover')
  const lyricsOnlyInstrumental =
    lyrics.length > 0 &&
    lyrics
      .filter((line) => line.text.trim())
      .every((line) => /instrumental|inst\.?|karaoke|off\s*vocal|enjoy/i.test(line.text))
  const isLyricsListHidden =
    config.lyricsHidden ||
    isCurrentTrackLyricsTemporarilyHidden ||
    isCurrentTrackLyricsInstrumental ||
    lyricsOnlyInstrumental
  const isSideMvVisibleInLyrics = Boolean(
    mvId && isSideLyricsMvEnabled(config) && !isCurrentTrackMvTemporarilyHidden
  )

  useEffect(() => {
    if (!showLyrics) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowLyrics(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showLyrics])

  const renderMvIframe = (mvObj, isBackground) => {
    if (!mvObj || !mvObj.id) return null

    const ytHost = 'https://www.youtube.com'
    const pageOrigin =
      typeof window !== 'undefined'
        ? window.location?.origin || 'https://www.youtube.com'
        : 'https://www.youtube.com'
    const ytOrigin = encodeURIComponent(pageOrigin)

    const qualitySetting = config.mvQuality || 'high'
    const biliQualityMap = { high: 80, medium: 64, low: 16 }
    const ytVqMap = { high: 'hd1080', medium: 'hd720', low: 'small' }
    const biliQuality = biliQualityMap[qualitySetting] || 80
    const ytVq = ytVqMap[qualitySetting] || 'hd1080'

    if (mvObj.source === 'bilibili') {
      if (biliDirectStream?.videoUrl) {
        const videoMuted = biliDirectStream.format === 'dash' || config.mvMuted || isAudioExclusive
        return (
          <>
            <video
              key={`bili_direct_v_${mvObj.id}_${isBackground ? 'bg' : 'main'}_${
                isAudioExclusive ? 'exc' : 'shared'
              }`}
              ref={isBackground ? biliBackgroundVideoRef : biliVideoRef}
              src={biliDirectStream.videoUrl}
              autoPlay
              muted={videoMuted}
              playsInline
              style={
                isBackground
                  ? {
                      width: '100%',
                      height: '100%',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      objectFit: 'cover'
                    }
                  : {}
              }
              className={isBackground ? '' : 'mv-iframe mv-direct-video'}
              onError={() => {
                console.warn('[Bilibili Video] Playback error, falling back to embed')
                setBiliDirectStream(null)
              }}
              onLoadedMetadata={() => restartPlaybackAfterMvLoaded('bilibili-direct-ready')}
              onEnded={() =>
                pauseMvMediaElement(
                  isBackground ? biliBackgroundVideoRef.current : biliVideoRef.current
                )
              }
            />
            {biliDirectStream.format === 'dash' &&
              biliDirectStream.audioUrl &&
              !config.mvMuted &&
              !isAudioExclusive && (
                <audio
                  key={`bili_direct_a_${mvObj.id}_${isAudioExclusive ? 'exc' : 'shared'}`}
                  ref={biliAudioRef}
                  src={biliDirectStream.audioUrl}
                  autoPlay
                  onEnded={() => pauseMvMediaElement(biliAudioRef.current)}
                  onLoadedMetadata={() => {
                    const vEl = biliVideoRef.current || biliBackgroundVideoRef.current
                    if (vEl && biliAudioRef.current) {
                      biliAudioRef.current.currentTime = vEl.currentTime
                    }
                  }}
                />
              )}
          </>
        )
      }
      return (
        <iframe
          ref={isBackground ? ytBackgroundIframeRef : ytIframeRef}
          src={`https://player.bilibili.com/player.html?bvid=${mvObj.id}&autoplay=1&muted=${config.mvMuted || isAudioExclusive ? 1 : 0}&high_quality=${qualitySetting === 'low' ? 0 : 1}&quality=${biliQuality}&danmaku=0`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={
            isBackground
              ? {
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  top: 0,
                  left: 0
                }
              : {}
          }
          className={isBackground ? '' : 'mv-iframe'}
        />
      )
    }

    return (
      <iframe
        ref={isBackground ? ytBackgroundIframeRef : ytIframeRef}
        src={`${ytHost}/embed/${mvObj.id}?autoplay=1&mute=${config.mvMuted || isAudioExclusive ? 1 : 0}&controls=0&disablekb=1&fs=0&modestbranding=1&enablejsapi=1&playsinline=1&rel=0&vq=${ytVq}&origin=${ytOrigin}&widgetid=${isBackground ? 2 : 1}`}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={
          isBackground
            ? {
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0
              }
            : {}
        }
        className={isBackground ? '' : 'mv-iframe'}
        onLoad={() => {
          ytReadyRef.current = false

          const iframe = isBackground ? ytBackgroundIframeRef.current : ytIframeRef.current
          if (iframe?.contentWindow && mvObj.source !== 'bilibili') {
            iframe.contentWindow.postMessage(
              JSON.stringify({
                event: 'listening',
                id: isBackground ? 'yt-bg' : 'yt-main',
                channel: 'widget'
              }),
              '*'
            )

            if (mvObj.source === 'youtube') {
              if (ytFallbackTimerRef.current) {
                clearTimeout(ytFallbackTimerRef.current)
              }
              ytFallbackTimerRef.current = setTimeout(() => {
                if (!ytReadyRef.current) {
                  setYoutubeMvLoginHint(true)
                  if (config.autoFallbackToBilibili) {
                    triggerAutoMvFallback('youtube-timeout-no-ready')
                  }
                }
              }, 5000)
            }
          }

          syncYTVideo(currentTime)
          if (mvObj.source === 'bilibili') {
            restartPlaybackAfterMvLoaded('bilibili-iframe-load')
          }
          if (!isPlaying) {
            if (iframe?.contentWindow && mvObj.source !== 'bilibili') {
              iframe.contentWindow.postMessage(
                JSON.stringify({
                  event: 'command',
                  func: 'pauseVideo',
                  args: []
                }),
                '*'
              )
            }
          }
        }}
      />
    )
  }

  const [isListenTogetherLoading, setIsListenTogetherLoading] = useState(false)

  const handleHostUploadStart = useCallback(() => {
    setIsPlaying(false)
    setIsListenTogetherLoading(true)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setCurrentTime(0)
  }, [])

  const handleHostPlayAfterBuffer = useCallback(() => {
    setIsListenTogetherLoading(false)
    setIsPlaying(true)
    if (audioRef.current) {
      audioRef.current.play().catch(console.error)
    }
  }, [])

  const handleHostUploadEnd = useCallback(() => {
    setIsListenTogetherLoading(false)
  }, [])

  const handleListenTogetherRemoteState = useCallback(
    ({ roomState, memberId, force = false, syncOffsetMs = 0, forceSeekThresholdSec = 2 }) => {
      setListenTogetherRoomState(roomState || null)
      const playback = roomState?.playback
      if (!playback?.streamUrl) return
      const isHost = !!memberId && roomState?.hostId === memberId
      if (isHost) return
      // Keep UI metadata in sync for members even without local track objects.
      setMetadata((prev) => ({
        ...prev,
        title: playback.title || prev.title || '',
        artist: playback.artist || prev.artist || ''
      }))
      if (playback.syncCover && playback.coverUrl) {
        setCoverUrlTrackPath(playlistRef.current[currentIndexRef.current]?.path || '')
        setCoverUrl(playback.coverUrl)
      }
      if (playback.syncMv && playback.mvSync?.id) {
        setMvId({ id: playback.mvSync.id, source: playback.mvSync.source || 'youtube' })
      }
      if (
        playback.syncLyrics &&
        Array.isArray(playback.syncedLyrics) &&
        playback.syncedLyrics.length
      ) {
        setLyrics(playback.syncedLyrics)
        setLyricsMatchStatus('matched')
      }
      const streamUrl = playback.streamUrl
      const trackId = (playback.trackId || '').trim()
      const audio = audioRef.current
      if (!audio) return
      const syncState = listenTogetherSyncRef.current

      if (
        syncState.trackId !== trackId ||
        syncState.streamUrl !== streamUrl ||
        audio.src !== streamUrl
      ) {
        syncState.trackId = trackId
        syncState.streamUrl = streamUrl
        syncState.isPlaying = null
        syncState.lastSeekAt = 0
        try {
          audio.pause()
        } catch {}
        try {
          audio.src = streamUrl
          audio.load()
        } catch {}
      }

      const expectedPos = Number(playback.positionSec || 0) + Number(syncOffsetMs || 0) / 1000
      const now = Date.now()
      if (Number.isFinite(expectedPos) && audio.readyState >= 1) {
        const diff = Math.abs((audio.currentTime || 0) - expectedPos)
        const seekThreshold = Math.max(0.5, Number(forceSeekThresholdSec || 2))
        if ((force || diff > seekThreshold) && now - syncState.lastSeekAt > 1800) {
          try {
            audio.currentTime = Math.max(0, expectedPos)
            syncState.lastSeekAt = now
          } catch {}
        }
      }

      if (playback.isPlaying !== syncState.isPlaying) {
        syncState.isPlaying = !!playback.isPlaying
        if (playback.isPlaying) {
          audio.play().catch(() => {})
          setIsPlaying(true)
        } else {
          try {
            audio.pause()
          } catch {}
          setIsPlaying(false)
        }
      }
    },
    []
  )

  const desktopLyricsSyncRef = useRef({
    lyrics: [],
    activeLyricIndex: -1,
    romajiDisplayLines: [],
    displayMainTitle: ''
  })
  useEffect(() => {
    desktopLyricsSyncRef.current = {
      lyrics,
      activeLyricIndex,
      romajiDisplayLines,
      displayMainTitle
    }
  }, [lyrics, activeLyricIndex, romajiDisplayLines, displayMainTitle])

  /**
   * Push the desktop-lyrics payload whenever the relevant state changes. The
   * main-process pull poll is kept as a 1 Hz fallback (for when ECHO has been
   * backgrounded long enough for Chromium to throttle the renderer), so this
   * push removes ~8 `webContents.executeJavaScript` calls per second whenever
   * the floating overlay is open and the main window is visible.
   */
  useEffect(() => {
    if (!config.desktopLyricsEnabled || !window.api?.updateLyricsDesktopData) return
    let payload
    try {
      payload = buildDesktopLyricsPayload(
        configRef.current,
        desktopLyricsSyncRef.current,
        i18n.t('lyrics.none')
      )
    } catch (e) {
      console.error('[desktop lyrics] push payload', e)
      return
    }
    if (!payload) return
    window.api.updateLyricsDesktopData(payload).catch(() => {})
  }, [config.desktopLyricsEnabled, lyrics, activeLyricIndex, romajiDisplayLines, displayMainTitle])

  /** Pulled by main process setInterval (not throttled when ECHO is minimized). */
  useEffect(() => {
    if (!config.desktopLyricsEnabled) {
      try {
        delete window.__getDesktopLyricsPayload
      } catch {
        /* ignore */
      }
      ;(async () => {
        try {
          if (window.api?.closeLyricsDesktop) await window.api.closeLyricsDesktop()
        } catch (e) {
          console.error('[desktop lyrics close]', e)
        }
      })()
      return undefined
    }

    window.__getDesktopLyricsPayload = () => {
      try {
        return buildDesktopLyricsPayload(
          configRef.current,
          desktopLyricsSyncRef.current,
          i18n.t('lyrics.none')
        )
      } catch (e) {
        console.error('[desktop lyrics] payload', e)
        return null
      }
    }
    ;(async () => {
      try {
        if (window.api?.openLyricsDesktop) await window.api.openLyricsDesktop()
        if (window.api?.setLyricsDesktopLocked) {
          await window.api.setLyricsDesktopLocked(configRef.current.desktopLyricsLocked === true)
        }
      } catch (e) {
        console.error('[desktop lyrics open]', e)
      }
    })()

    return () => {
      try {
        delete window.__getDesktopLyricsPayload
      } catch {
        /* ignore */
      }
    }
  }, [config.desktopLyricsEnabled])

  useEffect(() => {
    if (!config.desktopLyricsEnabled || !window.api?.setLyricsDesktopLocked) return
    window.api.setLyricsDesktopLocked(config.desktopLyricsLocked === true).catch((e) => {
      console.error('[desktop lyrics lock]', e)
    })
  }, [config.desktopLyricsEnabled, config.desktopLyricsLocked])

  const showLegacyMainPlayerChrome = false

  return (
    <div
      className={`app-root${showLyrics ? ' app-root--lyrics-mode' : ' app-root--main-mode'}${transportIsPlaying && !showLyrics && view !== 'settings' ? ' app-root--main-playing' : ''}${isGlassTransparent ? ' glass-transparent' : ''}${isGlassBlurOff ? ' glass-blur-off' : ''}${isGlassClear ? ' glass-clear' : ''}${config.ultraSmallScreenAdaptive ? ' app-root--ultra-small-adaptive' : ''}`}
    >
      <div
        className="app-container"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="app-theme-backdrop" style={themeBackdropStyle} aria-hidden />
        {!showLyrics &&
          customWallpaperUrl &&
          !config.themeCoverAsBackground &&
          hasVisibleWallpaper && (
            <div
              className="app-wallpaper-backdrop app-wallpaper-backdrop--custom"
              style={{
                opacity: wallpaperOpacity,
                backgroundImage: `url("${customWallpaperUrl}")`
              }}
            />
          )}
        {!showLyrics &&
          config.themeCoverAsBackground &&
          displaySafeCoverUrl &&
          hasVisibleWallpaper && (
            <div
              className="app-wallpaper-backdrop app-wallpaper-backdrop--cover"
              style={{
                backgroundImage: `url("${displaySafeCoverUrl.replace(/\\/g, '/')}")`,
                opacity: wallpaperOpacity
              }}
            />
          )}
        {showLyricsFluidBackground && (
          <div
            className="fluid-background"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: -1,
              pointerEvents: 'none',
              background: `
              radial-gradient(circle at 0% 0%, ${dynamicCoverTheme.accent1} 0%, transparent 60%),
              radial-gradient(circle at 100% 100%, ${dynamicCoverTheme.accent2} 0%, transparent 60%),
              radial-gradient(circle at 50% 50%, ${dynamicCoverTheme.bgColor} 0%, transparent 100%)
            `,
              mixBlendMode: config.themeCoverAsBackground ? 'color' : 'normal',
              opacity: 0.85,
              filter: 'blur(40px)',
              animation: 'fluidPan 20s ease-in-out infinite alternate',
              transform: 'scale(1.2)'
            }}
          />
        )}
        {mvId && (showLyrics ? isImmersiveLyricsMvVisible : config.mvAsBackgroundMain) && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: -1,
              opacity: config.mvBackgroundOpacity !== undefined ? config.mvBackgroundOpacity : 0.8,
              pointerEvents: 'none',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '100%',
                height: '100%',
                transform: 'translate(-50%, -50%) scale(1.2)',
                filter: `blur(${Math.max(0, Number(config.mvBackgroundBlur || 0))}px) saturate(1.05)`,
                willChange: 'transform, filter',
                pointerEvents: 'none'
              }}
            >
              {renderMvIframe(mvId, true)}
            </div>
          </div>
        )}
        {isConverting && (
          <div className="conversion-overlay">
            <div className="loader-box glass-panel">
              <div className="spinner"></div>
              <p>{conversionMsg}</p>
            </div>
          </div>
        )}
        <div
          className={`titlebar ${showLyrics ? 'titlebar--lyrics' : ''} ${brightLyricsBackdrop ? 'titlebar--bright-backdrop' : ''}`}
        >
          <span className="titlebar-appname">{t('app.title')}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button
              className="no-drag"
              type="button"
              onClick={() => setLyricsDrawerOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: lyricsDrawerOpen ? 'var(--accent-pink)' : 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--accent-pink)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = lyricsDrawerOpen ? 'var(--accent-pink)' : 'inherit'
              }}
              title={t('titlebar.lyricsSettings')}
            >
              <ListMusic size={18} />
            </button>
            <button
              className="no-drag"
              onClick={() => setDownloaderDrawerOpen((o) => !o)}
              style={{
                background: 'none',
                border: 'none',
                color: downloaderDrawerOpen ? 'var(--accent-pink)' : 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--accent-pink)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = downloaderDrawerOpen
                  ? 'var(--accent-pink)'
                  : 'inherit'
              }}
              title={t('titlebar.studioDownloader')}
            >
              <Download size={18} />
            </button>
            <button
              className="no-drag"
              type="button"
              onClick={() => setAudioSettingsDrawerOpen((o) => !o)}
              style={{
                background: 'none',
                border: 'none',
                color: audioSettingsDrawerOpen ? 'var(--accent-pink)' : 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--accent-pink)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = audioSettingsDrawerOpen
                  ? 'var(--accent-pink)'
                  : 'inherit'
              }}
              title={t('titlebar.audioSettings', 'Audio Settings')}
            >
              <Headphones size={18} />
            </button>
            <button
              className="no-drag"
              type="button"
              onClick={() => setMvDrawerOpen((o) => !o)}
              style={{
                background: 'none',
                border: 'none',
                color: mvDrawerOpen ? 'var(--accent-pink)' : 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--accent-pink)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = mvDrawerOpen ? 'var(--accent-pink)' : 'inherit'
              }}
              title={t('titlebar.mvSettings')}
            >
              <Film size={18} />
            </button>
            {config.showTitlebarCastSender === true && (
              <button
                className="no-drag"
                type="button"
                onClick={() => setCastSendDrawerOpen((o) => !o)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: castSendDrawerOpen ? 'var(--accent-pink)' : 'inherit',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = 'var(--accent-pink)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = castSendDrawerOpen ? 'var(--accent-pink)' : 'inherit'
                }}
                title={t('titlebar.castSender')}
              >
                <Cast size={18} />
              </button>
            )}
            <button
              className="no-drag"
              type="button"
              onClick={() => setCastDrawerOpen((o) => !o)}
              style={{
                background: 'none',
                border: 'none',
                color: castDrawerOpen || castDlnaListening ? 'var(--accent-pink)' : 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--accent-pink)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color =
                  castDrawerOpen || castDlnaListening ? 'var(--accent-pink)' : 'inherit'
              }}
              title={t('titlebar.castReceiver')}
            >
              <Radio size={18} />
            </button>
            {config.showTitlebarListenTogether === true && (
              <button
                className="no-drag"
                type="button"
                onClick={() => setListenTogetherDrawerOpen((o) => !o)}
                style={{
                  background: 'none',
                  border: 'none',
                  color:
                    listenTogetherDrawerOpen || listenTogetherRoomState?.roomId
                      ? 'var(--accent-pink)'
                      : 'inherit',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = 'var(--accent-pink)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color =
                    listenTogetherDrawerOpen || listenTogetherRoomState?.roomId
                      ? 'var(--accent-pink)'
                      : 'inherit'
                }}
                title={t('titlebar.listenTogether')}
              >
                <Users size={18} />
              </button>
            )}
            {config.showTitlebarPlugins === true && (
              <button
                className="no-drag"
                onClick={() => setPluginDrawerOpen((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: pluginDrawerOpen ? 'var(--accent-pink)' : 'inherit',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = 'var(--accent-pink)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = pluginDrawerOpen ? 'var(--accent-pink)' : 'inherit'
                }}
                title={t('titlebar.plugins')}
              >
                <Blocks size={18} />
              </button>
            )}
            <button
              className="no-drag"
              onClick={() => setView(view === 'settings' ? 'player' : 'settings')}
              style={{
                background: 'none',
                border: 'none',
                color: view === 'settings' ? 'var(--accent-pink)' : 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--accent-pink)'
                e.currentTarget.style.transform = 'rotate(45deg)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = view === 'settings' ? 'var(--accent-pink)' : 'inherit'
                e.currentTarget.style.transform = 'rotate(0deg)'
              }}
            >
              <Settings size={18} />
            </button>
            <button
              className="no-drag"
              onClick={() => window.api.minimizeAppHandler()}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--text-main)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.4)'
                e.currentTarget.style.borderRadius = '50%'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = 'inherit'
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderRadius = '0'
              }}
            >
              <Minus size={18} />
            </button>
            <button
              className="no-drag"
              onClick={() => window.api.maximizeAppHandler()}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--text-main)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.4)'
                e.currentTarget.style.borderRadius = '50%'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = 'inherit'
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderRadius = '0'
              }}
            >
              <Square size={14} />
            </button>
            <button
              className="no-drag"
              onClick={async () => {
                if (config.closeButtonBehavior === 'tray' && window.api?.hideToTrayHandler) {
                  await window.api.hideToTrayHandler()
                  return
                }
                window.api.closeAppHandler()
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = 'white'
                e.currentTarget.style.background = 'var(--accent-pink)'
                e.currentTarget.style.borderRadius = '50%'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = 'inherit'
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderRadius = '0'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {!showLyrics && view !== 'settings' && (
          <nav
            className={`nav-rail no-drag ${config.showSidebarLogo === false ? 'nav-rail--logo-hidden' : ''}`}
            aria-label="Library navigation"
          >
            {config.showSidebarLogo !== false && (
              <div className="nav-rail-logo nav-rail-logo--image">
                <img src={SIDEBAR_LOGO_IMAGE_SRC} alt="ECHO" draggable={false} />
              </div>
            )}
            <div className="nav-rail-section">
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'songs' ? 'active' : ''}`}
                onClick={() => handleListMode('songs')}
              >
                <Music size={16} /> {t('listMode.songs')}
              </button>
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'album' ? 'active' : ''}`}
                onClick={() => handleListMode('album')}
              >
                <Disc size={16} /> {t('listMode.albums')}
              </button>
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'artists' ? 'active' : ''}`}
                onClick={() => handleListMode('artists')}
              >
                <Users size={16} /> {t('listMode.artists', 'Artists')}
              </button>
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'folders' ? 'active' : ''}`}
                onClick={() => handleListMode('folders')}
              >
                <FolderOpen size={16} /> {t('listMode.folders')}
              </button>
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'remoteLibrary' ? 'active' : ''}`}
                onClick={() => handleListMode('remoteLibrary')}
              >
                <Globe size={16} /> 网盘 / 远程
              </button>
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'streaming' ? 'active' : ''}`}
                onClick={() => handleListMode('streaming')}
              >
                <Radio size={16} /> {t('listMode.streaming', 'Streaming')}
              </button>
              <button
                type="button"
                className={`nav-rail-item ${listMode === 'queue' ? 'active' : ''}`}
                onClick={() => handleListMode('queue')}
              >
                <ListPlus size={16} /> {t('listMode.queue')}
              </button>
              {config.historyShowInSidebar !== false && (
                <button
                  type="button"
                  className={`nav-rail-item ${listMode === 'history' ? 'active' : ''}`}
                  onClick={() => handleListMode('history')}
                >
                  <History size={16} /> {t('listMode.history', 'History')}
                </button>
              )}
              <div className={`nav-rail-collapse ${navPlaylistsExpanded ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className={`nav-rail-item nav-rail-item--with-caret ${listMode === 'playlists' ? 'active' : ''}`}
                  onClick={() => {
                    handleListMode('playlists')
                    setNavPlaylistsExpanded((value) => !value)
                  }}
                  aria-expanded={navPlaylistsExpanded}
                >
                  <ListMusic size={16} />
                  <span>{t('listMode.playlists')}</span>
                  <ChevronDown size={14} className="nav-rail-caret" aria-hidden />
                </button>
                {navPlaylistsExpanded && (
                  <div className="nav-rail-sublist" aria-label={t('listMode.playlists')}>
                    <button
                      type="button"
                      className={`nav-rail-subitem ${listMode === 'playlists' && !selectedUserPlaylistId && !selectedSmartCollectionId ? 'active' : ''}`}
                      onClick={() => handleListMode('playlists')}
                    >
                      {t('playlists.allPlaylists', 'All playlists')}
                    </button>
                    {userPlaylists.length === 0 ? (
                      <span className="nav-rail-subempty">
                        {t('playlists.noPlaylistsShort', 'No playlists')}
                      </span>
                    ) : (
                      userPlaylists.map((playlistItem) => (
                        <button
                          key={playlistItem.id}
                          type="button"
                          className={`nav-rail-subitem ${selectedUserPlaylistId === playlistItem.id ? 'active' : ''}`}
                          title={playlistItem.name}
                          onClick={() => openUserPlaylist(playlistItem.id)}
                        >
                          {playlistItem.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <ImportedFolderRail
              folders={importedFolderItems}
              activeFolder={selectedFolder}
              title={t('folders.importedRootsTitle', 'Imported folders')}
              emptyLabel={t('folders.noImportedRoots', 'No imported folders')}
              openLabel={t('folders.openImportedFolder', 'Open imported folder')}
              removeLabel={t('folders.removeImportedFolder', 'Remove imported folder')}
              onOpen={handleOpenImportedFolder}
              onRemove={handleRemoveImportedFolder}
            />
            <div className="nav-rail-bottom">
              <button
                className={`nav-rail-icon-btn ${showLikedOnly ? 'active' : ''}`}
                onClick={() => setShowLikedOnly((v) => !v)}
                title={t('like.filterOnlyTitle')}
                aria-pressed={showLikedOnly}
              >
                <Heart size={15} fill={showLikedOnly ? 'currentColor' : 'none'} strokeWidth={1.5} />{' '}
                {t('like.filterOnlyTitle')}
              </button>
              <button
                className={`nav-rail-icon-btn ${audioSettingsDrawerOpen ? 'active' : ''}`}
                onClick={() => setAudioSettingsDrawerOpen((o) => !o)}
                title={t('titlebar.audioSettings', 'Audio Settings')}
                aria-pressed={audioSettingsDrawerOpen}
              >
                <Headphones size={15} /> {t('titlebar.audioSettings', 'Audio Settings')}
              </button>
              <button
                className={`nav-rail-icon-btn ${lyricsDrawerOpen ? 'active' : ''}`}
                onClick={() => setLyricsDrawerOpen(true)}
                title={t('titlebar.lyricsSettings')}
                aria-pressed={lyricsDrawerOpen}
              >
                <Mic2 size={15} /> {t('titlebar.lyricsSettings')}
              </button>
              <button
                className="nav-rail-icon-btn"
                onClick={handleImport}
                title={t('import.folder')}
              >
                <FolderHeart size={15} /> {t('import.folder')}
              </button>
              <button
                className="nav-rail-icon-btn"
                onClick={handleImportFile}
                title={t('import.files')}
              >
                <FileAudio size={15} /> {t('import.files')}
              </button>
              <button className="nav-rail-icon-btn" onClick={() => setView('settings')}>
                <Settings size={15} /> {t('nav.settings', 'Settings')}
              </button>
            </div>
          </nav>
        )}

        <div
          className={`sidebar browser-panel glass-panel sidebar-panel-root no-drag ${showLyrics || view === 'settings' ? 'hidden' : ''}`}
        >
          <div className="browser-topbar-actions">
            <span className="browser-topbar-title">
              <span>
                {listMode === 'songs' && t('listMode.songs')}
                {listMode === 'album' && selectedAlbum === 'all' && t('listMode.albums')}
                {listMode === 'album' && selectedAlbum !== 'all' && selectedAlbum}
                {listMode === 'artists' &&
                  selectedArtist === 'all' &&
                  t('listMode.artists', 'Artists')}
                {listMode === 'artists' && selectedArtist !== 'all' && selectedArtist}
                {listMode === 'folders' && selectedFolder === 'all' && t('listMode.folders')}
                {listMode === 'folders' &&
                  selectedFolder !== 'all' &&
                  (selectedFolder.split(/[\\/]/).pop() || t('listMode.folders'))}
                {listMode === 'playlists' && t('listMode.playlists')}
                {listMode === 'remoteLibrary' && '网盘 / 远程音乐库'}
                {listMode === 'streaming' && t('listMode.streaming', 'Streaming')}
                {listMode === 'queue' && t('queue.title', 'Up Next')}
                {listMode === 'history' && t('listMode.history', 'History')}
              </span>
              {listMode !== 'remoteLibrary' &&
                listMode !== 'streaming' &&
                listMode !== 'queue' &&
                listMode !== 'history' && (
                <span className="browser-topbar-count">
                  {'\u00b7 '}
                  {listMode === 'album' && selectedAlbum === 'all'
                    ? t('albums.count', {
                        count: albumGroupsFiltered.length,
                        defaultValue: '{{count}} 张'
                      })
                    : listMode === 'artists' && selectedArtist === 'all'
                      ? t('artists.count', {
                          count: artistGroups.length,
                          defaultValue: '{{count}} \u4f4d'
                        })
                      : listMode === 'folders' && selectedFolder === 'all'
                        ? t('playlists.groups', {
                            count: folderGroupsFiltered.length,
                            defaultValue: '{{count}} 组'
                          })
                        : t('songs.count', {
                            count: tracksForSidebarListFiltered.length,
                            defaultValue: '{{count}} \u9996'
                          })}
                </span>
              )}
            </span>
            <div
              className="browser-toolbar-group"
              aria-label={t('aria.libraryActions', 'Library actions')}
              style={{
                display:
                  listMode === 'remoteLibrary' ||
                  listMode === 'streaming' ||
                  listMode === 'queue' ||
                  listMode === 'history'
                    ? 'none'
                    : ''
              }}
            >
              <button
                className="browser-toolbar-btn"
                onClick={handleImport}
                title={t('import.folder')}
                aria-label={t('import.folder')}
              >
                <FolderHeart size={17} />
              </button>
              <button
                className="browser-toolbar-btn"
                onClick={handleImportFile}
                title={t('import.files')}
                aria-label={t('import.files')}
              >
                <FileAudio size={17} />
              </button>
              <button
                className="browser-toolbar-btn"
                onClick={exportMainPlaylistM3U}
                title={t('playlists.exportM3U')}
                aria-label={t('aria.exportPlaylist')}
              >
                <Download size={17} />
              </button>
              <button
                className="browser-toolbar-btn browser-toolbar-btn--danger"
                onClick={() => {
                  if (
                    window.confirm(
                      t('import.clearPlaylistConfirm', {
                        defaultValue:
                          '\u786e\u5b9a\u8981\u6e05\u7a7a\u5f53\u524d\u64ad\u653e\u5217\u8868\u5417\uff1f'
                      })
                    )
                  ) {
                    handleClearPlaylist()
                  }
                }}
                title={t('import.clearPlaylist')}
                aria-label={t('import.clearPlaylist')}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
          {listMode !== 'remoteLibrary' &&
            listMode !== 'streaming' &&
            listMode !== 'queue' &&
            listMode !== 'history' && (
            <div className="search-container no-drag" style={{ flexShrink: 0 }}>
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder={t('search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('common.clear', { defaultValue: 'Clear' })}
                  title={t('common.clear', { defaultValue: 'Clear' })}
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              )}
              {listMode === 'songs' && (
                <div className="folder-sort-wrap search-sort-wrap" ref={songSortRef}>
                  <button
                    type="button"
                    className="folder-sort-trigger"
                    onClick={() => setSongSortOpen((v) => !v)}
                    aria-expanded={songSortOpen}
                  >
                    {songSortMode === 'dateAsc'
                      ? t('songs.sortDateAsc', 'Oldest added')
                      : songSortMode === 'dateDesc'
                        ? t('songs.sortDateDesc', 'Newest added')
                        : songSortMode === 'nameAsc'
                          ? t('songs.sortNameAsc', 'Name (A-Z)')
                          : songSortMode === 'nameDesc'
                            ? t('songs.sortNameDesc', 'Name (Z-A)')
                            : songSortMode === 'durationAsc'
                              ? t('songs.sortDurationAsc', 'Duration (Short)')
                              : songSortMode === 'durationDesc'
                                ? t('songs.sortDurationDesc', 'Duration (Long)')
                                : songSortMode === 'qualityAsc'
                                  ? t('songs.sortQualityAsc', 'Quality (Low)')
                                  : songSortMode === 'qualityDesc'
                                    ? t('songs.sortQualityDesc', 'Quality (High)')
                                    : songSortMode === 'frequentDesc'
                                      ? t('songs.sortFrequentDesc', 'Most played first')
                                      : songSortMode === 'random'
                                        ? t('songs.sortRandom', 'Random')
                                        : t('songs.sortDefault', 'Default')}
                    <ChevronDown size={14} aria-hidden strokeWidth={1.5} />
                  </button>
                  {songSortOpen && (
                    <div className="folder-sort-menu" role="menu">
                      {[
                        { key: 'default', label: t('songs.sortDefault', 'Default') },
                        { key: 'dateAsc', label: t('songs.sortDateAsc', 'Oldest added') },
                        { key: 'dateDesc', label: t('songs.sortDateDesc', 'Newest added') },
                        { key: 'nameAsc', label: t('songs.sortNameAsc', 'Name (A-Z)') },
                        { key: 'nameDesc', label: t('songs.sortNameDesc', 'Name (Z-A)') },
                        {
                          key: 'durationAsc',
                          label: t('songs.sortDurationAsc', 'Duration (Short)')
                        },
                        {
                          key: 'durationDesc',
                          label: t('songs.sortDurationDesc', 'Duration (Long)')
                        },
                        { key: 'qualityAsc', label: t('songs.sortQualityAsc', 'Quality (Low)') },
                        { key: 'qualityDesc', label: t('songs.sortQualityDesc', 'Quality (High)') },
                        {
                          key: 'frequentDesc',
                          label: t('songs.sortFrequentDesc', 'Most played first')
                        },
                        {
                          key: 'random',
                          label: t('songs.sortRandom', 'Random')
                        }
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="menuitem"
                          className={`folder-sort-menu-item${songSortMode === opt.key ? ' active' : ''}`}
                          onClick={() => {
                            if (opt.key === 'random') setSongRandomSortSeed(createSongRandomSortSeed())
                            setSongSortMode(opt.key)
                            setSongSortOpen(false)
                          }}
                        >
                          <div className="folder-sort-chk">
                            {songSortMode === opt.key && <Check size={14} strokeWidth={2} />}
                          </div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {listMode === 'album' && selectedAlbum === 'all' && (
                <div className="folder-sort-wrap search-sort-wrap" ref={albumSortRef}>
                  <button
                    type="button"
                    className="folder-sort-trigger"
                    onClick={() => setAlbumSortOpen((v) => !v)}
                    aria-expanded={albumSortOpen}
                  >
                    {activeAlbumSortLabel}
                    <ChevronDown size={14} aria-hidden strokeWidth={1.5} />
                  </button>
                  {albumSortOpen && (
                    <div className="folder-sort-menu" role="menu">
                      {albumSortOptions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="menuitem"
                          className={`folder-sort-menu-item${albumSortMode === opt.key ? ' active' : ''}`}
                          onClick={() => {
                            setAlbumSortMode(opt.key)
                            setAlbumSortOpen(false)
                          }}
                        >
                          <div className="folder-sort-chk">
                            {albumSortMode === opt.key && <Check size={14} strokeWidth={2} />}
                          </div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {listMode === 'artists' && selectedArtist === 'all' && (
                <div className="folder-sort-wrap search-sort-wrap" ref={artistSortRef}>
                  <button
                    type="button"
                    className="folder-sort-trigger"
                    onClick={() => setArtistSortOpen((v) => !v)}
                    aria-expanded={artistSortOpen}
                  >
                    {activeArtistSortLabel}
                    <ChevronDown size={14} aria-hidden strokeWidth={1.5} />
                  </button>
                  {artistSortOpen && (
                    <div className="folder-sort-menu" role="menu">
                      {artistSortOptions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="menuitem"
                          className={`folder-sort-menu-item${artistSortMode === opt.key ? ' active' : ''}`}
                          onClick={() => {
                            setArtistSortMode(opt.key)
                            setArtistSortOpen(false)
                          }}
                        >
                          <div className="folder-sort-chk">
                            {artistSortMode === opt.key && <Check size={14} strokeWidth={2} />}
                          </div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            className={`sidebar-list-stack${listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId) ? ' sidebar-list-stack--pl-detail' : ''}`}
          >
            <div className="list-filter-bar no-drag">
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'songs' ? 'active' : ''}`}
                onClick={() => handleListMode('songs')}
              >
                {t('listMode.songs')}
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'album' ? 'active' : ''}`}
                onClick={() => handleListMode('album')}
              >
                {t('listMode.albums')}
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'artists' ? 'active' : ''}`}
                onClick={() => handleListMode('artists')}
              >
                {t('listMode.artists', 'Artists')}
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'playlists' ? 'active' : ''}`}
                onClick={() => handleListMode('playlists')}
              >
                {t('listMode.playlists')}
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'folders' ? 'active' : ''}`}
                onClick={() => handleListMode('folders')}
              >
                {t('listMode.folders')}
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'remoteLibrary' ? 'active' : ''}`}
                onClick={() => handleListMode('remoteLibrary')}
              >
                网盘
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'streaming' ? 'active' : ''}`}
                onClick={() => handleListMode('streaming')}
              >
                {t('listMode.streaming', 'Streaming')}
              </button>
              <button
                type="button"
                className={`list-filter-chip ${listMode === 'queue' ? 'active' : ''}`}
                onClick={() => handleListMode('queue')}
              >
                {t('listMode.queue')}
              </button>
              {config.historyShowInSidebar !== false && (
                <button
                  type="button"
                  className={`list-filter-chip ${listMode === 'history' ? 'active' : ''}`}
                  onClick={() => handleListMode('history')}
                >
                  {t('listMode.history', 'History')}
                </button>
              )}
            </div>

            {selectedAlbum !== 'all' && listMode === 'songs' && (
              <div className="album-filter-pill no-drag">
                <span>{t('albumFilter.label', { name: selectedAlbum })}</span>
                <button onClick={handleBackToAlbumOverview}>{t('albumFilter.clear')}</button>
              </div>
            )}

            {selectedFolder !== 'all' && listMode === 'folders' && (
              <div className="album-filter-pill no-drag">
                <span>{t('folderFilter.label', { name: getPathBasename(selectedFolder) })}</span>
                <button onClick={() => setSelectedFolder('all')}>{t('folderFilter.clear')}</button>
              </div>
            )}

            {playlist.length > 0 && listMode === 'folders' && selectedFolder === 'all' && (
              <div className="folder-browser-header no-drag" style={{ margin: '0 12px 8px' }}>
                <span className="folder-browser-title">{t('folders.heading')}</span>
                <span className="folder-browser-count">({folderGroupsFiltered.length})</span>
                <div className="folder-sort-wrap" ref={folderSortRef}>
                  <button
                    type="button"
                    className="folder-sort-trigger"
                    onClick={() => setFolderSortOpen((v) => !v)}
                    aria-expanded={folderSortOpen}
                  >
                    {folderSortMode === 'dateAsc'
                      ? t('folders.sortDateAsc')
                      : folderSortMode === 'dateDesc'
                        ? t('folders.sortDateDesc')
                        : t('folders.sortName')}
                    <ChevronDown size={12} style={{ marginLeft: 2, opacity: 0.6 }} />
                  </button>
                  {folderSortOpen && (
                    <div className="folder-sort-menu" role="menu">
                      {[
                        { key: 'default', label: t('folders.sortName') },
                        { key: 'dateAsc', label: t('folders.sortDateAsc') },
                        { key: 'dateDesc', label: t('folders.sortDateDesc') }
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="menuitem"
                          className={`folder-sort-menu-item${folderSortMode === opt.key ? ' active' : ''}`}
                          onClick={() => {
                            setFolderSortMode(opt.key)
                            setFolderSortOpen(false)
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {((listMode === 'folders' && selectedFolder !== 'all') ||
              (listMode === 'artists' && selectedArtist !== 'all') ||
              (listMode === 'album' && selectedAlbum !== 'all')) && (
              <div
                className={`folder-browser-header library-list-header no-drag${listMode === 'artists' && selectedArtist !== 'all' ? ' library-list-header--artist-detail' : ''}${artistDetailLeaving ? ' library-list-header--leaving' : ''}`}
              >
                <div className="library-list-heading">
                  {listMode === 'album' && selectedAlbum !== 'all' && (
                    <button
                      type="button"
                      className="user-playlist-detail-back"
                      onClick={handleBackToAlbumOverview}
                      aria-label={t('nav.back')}
                      title={t('nav.back')}
                      style={{ marginRight: 4 }}
                    >
                      <ChevronLeft size={20} strokeWidth={1.5} />
                    </button>
                  )}
                  {listMode === 'artists' && selectedArtist !== 'all' && (
                    <button
                      type="button"
                      className="user-playlist-detail-back"
                      onClick={handleBackToArtistOverview}
                      aria-label={t('nav.back')}
                      title={t('nav.back')}
                      style={{ marginRight: 4 }}
                    >
                      <ChevronLeft size={20} strokeWidth={1.5} />
                    </button>
                  )}
                  <div className="library-list-heading-text">
                    <span className="folder-browser-title library-list-title">
                      {listMode === 'folders' && selectedFolder !== 'all'
                        ? getPathBasename(selectedFolder) || t('folders.heading')
                        : listMode === 'artists'
                          ? selectedArtist
                          : listMode === 'album'
                            ? selectedAlbum
                            : t('songs.heading', 'Songs')}
                    </span>
                    <span className="folder-browser-count library-list-count">
                      {t('playlists.detailTrackCount', {
                        count: tracksForSidebarListFiltered.length
                      })}
                    </span>
                  </div>
                </div>
                <div className="folder-sort-wrap" ref={songSortRef}>
                  <button
                    type="button"
                    className="folder-sort-trigger"
                    onClick={() => setSongSortOpen((v) => !v)}
                    aria-expanded={songSortOpen}
                  >
                    {songSortMode === 'dateAsc'
                      ? t('songs.sortDateAsc', 'Oldest added')
                      : songSortMode === 'dateDesc'
                        ? t('songs.sortDateDesc', 'Newest added')
                        : songSortMode === 'nameAsc'
                          ? t('songs.sortNameAsc', 'Name (A-Z)')
                          : songSortMode === 'nameDesc'
                            ? t('songs.sortNameDesc', 'Name (Z-A)')
                            : songSortMode === 'durationAsc'
                              ? t('songs.sortDurationAsc', 'Duration (Short)')
                              : songSortMode === 'durationDesc'
                                ? t('songs.sortDurationDesc', 'Duration (Long)')
                                : songSortMode === 'qualityAsc'
                                  ? t('songs.sortQualityAsc', 'Quality (Low)')
                                  : songSortMode === 'qualityDesc'
                                    ? t('songs.sortQualityDesc', 'Quality (High)')
                                    : songSortMode === 'frequentDesc'
                                      ? t('songs.sortFrequentDesc', 'Most played first')
                                      : songSortMode === 'random'
                                        ? t('songs.sortRandom', 'Random')
                                        : t('songs.sortDefault', 'Default')}
                    <ChevronDown size={14} aria-hidden strokeWidth={1.5} />
                  </button>
                  {songSortOpen && (
                    <div className="folder-sort-menu" role="menu">
                      {[
                        { key: 'default', label: t('songs.sortDefault', 'Default') },
                        { key: 'dateAsc', label: t('songs.sortDateAsc', 'Oldest added') },
                        { key: 'dateDesc', label: t('songs.sortDateDesc', 'Newest added') },
                        { key: 'nameAsc', label: t('songs.sortNameAsc', 'Name (A-Z)') },
                        { key: 'nameDesc', label: t('songs.sortNameDesc', 'Name (Z-A)') },
                        {
                          key: 'durationAsc',
                          label: t('songs.sortDurationAsc', 'Duration (Short)')
                        },
                        {
                          key: 'durationDesc',
                          label: t('songs.sortDurationDesc', 'Duration (Long)')
                        },
                        { key: 'qualityAsc', label: t('songs.sortQualityAsc', 'Quality (Low)') },
                        { key: 'qualityDesc', label: t('songs.sortQualityDesc', 'Quality (High)') },
                        {
                          key: 'frequentDesc',
                          label: t('songs.sortFrequentDesc', 'Most played first')
                        },
                        {
                          key: 'random',
                          label: t('songs.sortRandom', 'Random')
                        }
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="menuitem"
                          className={`folder-sort-menu-item${songSortMode === opt.key ? ' active' : ''}`}
                          onClick={() => {
                            if (opt.key === 'random') setSongRandomSortSeed(createSongRandomSortSeed())
                            setSongSortMode(opt.key)
                            setSongSortOpen(false)
                          }}
                        >
                          <div className="folder-sort-chk">
                            {songSortMode === opt.key && <Check size={14} strokeWidth={2} />}
                          </div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="playlist-scroll-shell">
              <div
                className={`playlist playlist--custom-scrollbar${listMode === 'album' ? ' playlist-album-mode' : ''}${listMode === 'folders' ? ' playlist-album-mode' : ''}${listMode === 'artists' ? ' playlist-album-mode' : ''}${listMode === 'queue' ? ' playlist--queue' : ''}${listMode === 'history' ? ' playlist--history' : ''}${listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId) ? ' playlist--pl-detail' : ''}`}
                ref={sidebarPlaylistRef}
                onScroll={handleSidebarScroll}
              >
                {listMode === 'queue' && (
                  <QueueSidebarView
                    items={upNextSidebarItems}
                    currentPath={currentTrack?.path || ''}
                    rowHeight={SIDEBAR_ROW_HEIGHT}
                    queueDragOver={queueDragOver}
                    queuePlaybackEnabled={queuePlaybackEnabled}
                    canUndo={queueUndoStack.length > 0}
                    albumArtistByName={albumArtistByName}
                    formatDuration={formatTime}
                    onExternalDragOver={handleQueueDragOver}
                    onExternalDragLeave={handleQueueDragLeave}
                    onExternalDrop={handleQueueDrop}
                    onReorder={reorderUpNextQueueByPath}
                    onRemove={removeFromUpNextQueueWithUndo}
                    onRemoveMany={removeManyFromUpNextQueueWithUndo}
                    onRemoveAbove={removeUpNextAboveWithUndo}
                    onRemoveBelow={removeUpNextBelowWithUndo}
                    onClear={clearUpNextQueueWithUndo}
                    onShuffle={shuffleUpNextQueue}
                    onSaveAsPlaylist={saveUpNextQueueAsPlaylist}
                    onToggleQueuePlayback={() => setQueuePlaybackEnabled((prev) => !prev)}
                    onPlayNow={playUpNextQueueItemNow}
                    onPlayNext={playUpNextPathNext}
                    onMoveTop={moveUpNextPathToTop}
                    onMoveBottom={moveUpNextPathToBottom}
                    onUndo={undoQueueMutation}
                  />
                )}

                {listMode === 'history' && config.historyShowInSidebar !== false && (
                  <HistorySidebarView
                    entries={playbackHistoryEntries}
                    canBack={playbackHistory.length > 0}
                    onBack={handleHistoryBack}
                    onClear={handleHistoryClear}
                    onPlay={playFromHistoryEntry}
                    onJump={handleHistoryJump}
                    onRemove={removePlaybackHistoryEntry}
                  />
                )}

                {listMode === 'remoteLibrary' && (
                  <RemoteLibraryView
                    sources={remoteLibrarySources}
                    activeSourceId={activeRemoteLibrarySourceId}
                    onActiveSourceChange={setActiveRemoteLibrarySourceId}
                    onOpenSettings={() => {
                      setView('settings')
                      setActiveSettingsSection('remoteLibrary')
                    }}
                    onPlayTrack={playRemoteLibraryTrack}
                    onQueueTrack={queueRemoteLibraryTrack}
                  />
                )}

                {listMode === 'streaming' && (
                  <StreamingView
                    onPlayTrack={playStreamingTrack}
                  />
                )}

                {playlist.length === 0 &&
                  listMode !== 'playlists' &&
                  listMode !== 'remoteLibrary' &&
                  listMode !== 'streaming' &&
                  listMode !== 'queue' &&
                  listMode !== 'history' && (
                    <div className="app-empty-state app-empty-state--minimal">
                      <p className="app-empty-state__title">{t('empty.noTracks')}</p>
                      <p className="app-empty-state__hint">{t('empty.importFolder')}</p>
                    </div>
                  )}

                {listMode === 'playlists' &&
                  !selectedUserPlaylistId &&
                  !selectedSmartCollectionId && (
                    <div className="user-playlist-library no-drag">
                      <div className="user-playlist-library-chrome" style={{ marginBottom: 14 }}>
                        <div className="user-playlist-library-header">
                          <span className="user-playlist-library-heading">
                            {t('playlists.smartCollections', 'Smart collections')}
                          </span>
                          <span className="user-playlist-library-count">
                            {smartCollections.length}
                          </span>
                          <button
                            type="button"
                            className="user-playlist-detail-btn"
                            style={{ marginLeft: 'auto' }}
                            onClick={() =>
                              smartCollectionEditorOpen && !editingSmartCollectionId
                                ? resetSmartCollectionEditor()
                                : openCreateSmartCollectionEditor()
                            }
                          >
                            <Wand2 size={14} aria-hidden />
                            {smartCollectionEditorOpen && !editingSmartCollectionId
                              ? t('common.cancel', { defaultValue: 'Cancel' })
                              : t('playlists.customSmartCollection', 'Custom rules')}
                          </button>
                        </div>
                        <p className="smart-collection-hint">
                          {t(
                            'playlists.smartCollectionsHint',
                            'Tap a template to create it instantly, or open custom rules if you want something more specific.'
                          )}
                        </p>
                        <div className="smart-collection-template-row">
                          {smartCollectionTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              className="smart-collection-template-chip"
                              onClick={() => applySmartCollectionTemplate(template.buildDraft)}
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                        {smartCollectionEditorOpen && (
                          <div className="smart-collection-editor">
                            <div className="smart-collection-preview">
                              {describeSmartCollectionDraft(smartCollectionDraft)}
                            </div>
                            <div className="smart-collection-editor-grid">
                              <label className="smart-collection-field">
                                <span className="smart-collection-field-label">
                                  {t('playlists.smartCollectionName', 'Name')}
                                </span>
                                <input
                                  type="text"
                                  className="new-playlist-input"
                                  placeholder={t(
                                    'playlists.smartCollectionNamePlaceholder',
                                    'Late-night favorites'
                                  )}
                                  value={smartCollectionDraft.name}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField('name', e.target.value)
                                  }
                                />
                              </label>
                              <label className="smart-collection-field">
                                <span className="smart-collection-field-label">
                                  {t('playlists.smartMatchMode', 'Match')}
                                </span>
                                <select
                                  className="new-playlist-input smart-collection-select"
                                  value={smartCollectionDraft.matchMode}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField('matchMode', e.target.value)
                                  }
                                >
                                  <option value="all">
                                    {t('playlists.smartMatchAll', 'All rules')}
                                  </option>
                                  <option value="any">
                                    {t('playlists.smartMatchAny', 'Any rule')}
                                  </option>
                                </select>
                              </label>
                            </div>
                            <div className="smart-collection-natural-list">
                              <label className="smart-collection-natural-row">
                                <input
                                  type="checkbox"
                                  checked={smartCollectionDraft.likedOnly}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField('likedOnly', e.target.checked)
                                  }
                                />
                                <span>
                                  {t('playlists.smartNaturalLikedOnly', 'Only include liked songs')}
                                </span>
                              </label>
                              <label className="smart-collection-natural-row">
                                <span>
                                  {t(
                                    'playlists.smartNaturalMinPlayPrefix',
                                    'Include songs played at least'
                                  )}
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  className="smart-collection-inline-input"
                                  placeholder="5"
                                  value={smartCollectionDraft.minPlayCount}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField('minPlayCount', e.target.value)
                                  }
                                />
                                <span>{t('playlists.smartNaturalMinPlaySuffix', 'times')}</span>
                              </label>
                              <label className="smart-collection-natural-row">
                                <span>
                                  {t(
                                    'playlists.smartNaturalPlayedPrefix',
                                    'Include songs played in the last'
                                  )}
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  className="smart-collection-inline-input"
                                  placeholder="30"
                                  value={smartCollectionDraft.playedWithinDays}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField(
                                      'playedWithinDays',
                                      e.target.value
                                    )
                                  }
                                />
                                <span>{t('playlists.smartNaturalDaysSuffix', 'days')}</span>
                              </label>
                              <label className="smart-collection-natural-row">
                                <span>
                                  {t(
                                    'playlists.smartNaturalAddedPrefix',
                                    'Include songs added in the last'
                                  )}
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  className="smart-collection-inline-input"
                                  placeholder="14"
                                  value={smartCollectionDraft.addedWithinDays}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField(
                                      'addedWithinDays',
                                      e.target.value
                                    )
                                  }
                                />
                                <span>{t('playlists.smartNaturalDaysSuffix', 'days')}</span>
                              </label>
                              <label className="smart-collection-natural-row">
                                <span>
                                  {t(
                                    'playlists.smartNaturalTitlePrefix',
                                    'Include songs whose title contains'
                                  )}
                                </span>
                                <input
                                  type="text"
                                  className="smart-collection-inline-input smart-collection-inline-input--text"
                                  placeholder={t(
                                    'playlists.smartTitleContainsPlaceholder',
                                    'night'
                                  )}
                                  value={smartCollectionDraft.titleIncludes}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField('titleIncludes', e.target.value)
                                  }
                                />
                              </label>
                              <label className="smart-collection-natural-row">
                                <span>
                                  {t(
                                    'playlists.smartNaturalArtistPrefix',
                                    'Include songs whose artist contains'
                                  )}
                                </span>
                                <input
                                  type="text"
                                  className="smart-collection-inline-input smart-collection-inline-input--text"
                                  placeholder="Aimer"
                                  value={smartCollectionDraft.artistIncludes}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField(
                                      'artistIncludes',
                                      e.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="smart-collection-natural-row">
                                <span>
                                  {t(
                                    'playlists.smartNaturalAlbumPrefix',
                                    'Include songs whose album contains'
                                  )}
                                </span>
                                <input
                                  type="text"
                                  className="smart-collection-inline-input smart-collection-inline-input--text"
                                  placeholder={t('playlists.smartAlbumContainsPlaceholder', 'live')}
                                  value={smartCollectionDraft.albumIncludes}
                                  onChange={(e) =>
                                    updateSmartCollectionDraftField('albumIncludes', e.target.value)
                                  }
                                />
                              </label>
                            </div>
                            <div className="smart-collection-editor-actions">
                              <button
                                type="button"
                                className="user-playlist-detail-btn user-playlist-detail-btn--primary"
                                onClick={saveSmartCollectionDraft}
                              >
                                <Check size={14} aria-hidden />
                                {editingSmartCollectionId
                                  ? t('common.save', { defaultValue: 'Save' })
                                  : t('playlists.createSmartCollection', 'Create smart collection')}
                              </button>
                              <button
                                type="button"
                                className="user-playlist-detail-btn"
                                onClick={resetSmartCollectionEditor}
                              >
                                <X size={14} aria-hidden />
                                {t('common.cancel', { defaultValue: 'Cancel' })}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="user-playlist-list" style={{ marginBottom: 18 }}>
                        {smartCollections.map((collection) => {
                          const Icon = collection.icon
                          const isActive =
                            listMode === 'playlists' && selectedSmartCollectionId === collection.id
                          return (
                            <div
                              key={collection.id}
                              className={`user-playlist-card${isActive ? ' user-playlist-card--active' : ''}`}
                            >
                              <button
                                type="button"
                                className="user-playlist-card-main"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'copy'
                                  e.dataTransfer.setData(
                                    'application/x-echo-smart-collection-id',
                                    collection.id
                                  )
                                  e.dataTransfer.setData(
                                    'text/x-echo-smart-collection-id',
                                    collection.id
                                  )
                                }}
                                onClick={() => openSmartCollection(collection.id)}
                              >
                                <Icon size={16} className="user-playlist-card-icon" aria-hidden />
                                <span className="user-playlist-name">{collection.name}</span>
                                <span className="user-playlist-count">
                                  {t('playlists.detailTrackCount', {
                                    count: collection.tracks.length
                                  })}
                                </span>
                              </button>
                              {collection.kind === 'custom' && (
                                <div className="user-playlist-card-actions">
                                  <button
                                    type="button"
                                    className="user-playlist-card-icon-btn"
                                    aria-label={t(
                                      'playlists.editSmartCollection',
                                      'Edit smart collection'
                                    )}
                                    title={t(
                                      'playlists.editSmartCollection',
                                      'Edit smart collection'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openEditSmartCollectionEditor(collection.id)
                                    }}
                                  >
                                    <Pencil size={15} strokeWidth={1.5} />
                                  </button>
                                  <button
                                    type="button"
                                    className="user-playlist-card-icon-btn"
                                    aria-label={t(
                                      'playlists.deleteSmartCollection',
                                      'Delete smart collection'
                                    )}
                                    title={t(
                                      'playlists.deleteSmartCollection',
                                      'Delete smart collection'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      deleteSmartCollection(collection.id)
                                    }}
                                  >
                                    <Trash2 size={15} strokeWidth={1.5} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="user-playlist-library-chrome">
                        <div
                          className="user-playlist-library-header"
                          onDragOver={handleSmartCollectionDragOver}
                          onDrop={handleSmartCollectionDropToLibrary}
                        >
                          <span className="user-playlist-library-heading">
                            {t('playlists.yourPlaylists')}
                          </span>
                          <span className="user-playlist-library-count">
                            {userPlaylists.length}
                          </span>
                          <div className="new-playlist-inline">
                            <input
                              ref={newPlaylistInputRef}
                              type="text"
                              className="new-playlist-input"
                              placeholder={t('playlists.newNamePlaceholder')}
                              value={newPlaylistName}
                              onChange={(e) => setNewPlaylistName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitNewPlaylistFromToolbar()
                              }}
                            />
                            <button
                              type="button"
                              className="new-playlist-submit"
                              onClick={submitNewPlaylistFromToolbar}
                            >
                              <Plus size={16} />
                              {t('playlists.create')}
                            </button>
                          </div>
                          <div className="user-playlist-more-wrap" ref={playlistLibraryMoreRef}>
                            <button
                              type="button"
                              className="user-playlist-more-trigger"
                              aria-expanded={playlistLibraryMoreOpen}
                              aria-haspopup="menu"
                              aria-label={t('aria.playlistLibraryOptions')}
                              title={t('playlists.more')}
                              onClick={() => setPlaylistLibraryMoreOpen((open) => !open)}
                            >
                              <MoreHorizontal size={18} strokeWidth={1.5} />
                            </button>
                            {playlistLibraryMoreOpen && (
                              <div className="user-playlist-more-menu" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="user-playlist-more-item"
                                  onClick={() => {
                                    setPlaylistLibraryMoreOpen(false)
                                    importUserPlaylists()
                                  }}
                                >
                                  <Upload size={14} aria-hidden />
                                  {t('playlists.importLibrary')}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="user-playlist-more-item"
                                  onClick={() => {
                                    setPlaylistLibraryMoreOpen(false)
                                    exportUserPlaylists()
                                  }}
                                >
                                  <Download size={14} aria-hidden />
                                  {t('playlists.exportAll')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {userPlaylists.length === 0 ? (
                        <div className="app-empty-state app-empty-state--minimal user-playlist-empty">
                          <p className="app-empty-state__title">{t('empty.noPlaylists')}</p>
                        </div>
                      ) : (
                        <div className="user-playlist-list">
                          {userPlaylists.map((pl) => (
                            <div
                              key={pl.id}
                              className={`user-playlist-card${listMode === 'playlists' && selectedUserPlaylistId === pl.id ? ' user-playlist-card--active' : ''}`}
                              onDragOver={handleSmartCollectionDragOver}
                              onDrop={(e) => handleSmartCollectionDropToPlaylist(e, pl.id)}
                            >
                              <button
                                type="button"
                                className="user-playlist-card-main"
                                onClick={() => openUserPlaylist(pl.id)}
                              >
                                <ListMusic
                                  size={16}
                                  className="user-playlist-card-icon"
                                  aria-hidden
                                />
                                <span className="user-playlist-name">{pl.name}</span>
                                <span className="user-playlist-count">
                                  {t('playlists.detailTrackCount', {
                                    count: pl.paths.length
                                  })}
                                </span>
                              </button>
                              <div className="user-playlist-card-actions">
                                <button
                                  type="button"
                                  className="user-playlist-card-icon-btn"
                                  aria-label={t('aria.exportPlaylist')}
                                  title={t('playlists.exportM3U')}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    exportUserPlaylistM3U(pl.id)
                                  }}
                                >
                                  <Download size={15} strokeWidth={1.5} />
                                </button>
                                <button
                                  type="button"
                                  className="user-playlist-card-icon-btn"
                                  aria-label={t('aria.renamePlaylist')}
                                  title={t('playlists.rename')}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    renameUserPlaylist(pl.id)
                                  }}
                                >
                                  <Pencil size={15} strokeWidth={1.5} />
                                </button>
                                <button
                                  type="button"
                                  className="user-playlist-card-icon-btn"
                                  aria-label={t('aria.deletePlaylist')}
                                  title={t('playlists.delete')}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteUserPlaylist(pl.id)
                                  }}
                                >
                                  <Trash2 size={15} strokeWidth={1.5} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {playlist.length > 0 && listMode === 'album' && selectedAlbum === 'all' && (
                  <div className="album-browser no-drag">
                    <div
                      ref={setAlbumGridElement}
                      className="album-grid album-grid-deferred"
                      style={{
                        paddingTop: visibleAlbumRange.topSpacer,
                        paddingBottom: visibleAlbumRange.bottomSpacer
                      }}
                    >
                      {visibleAlbumGroups.map((album) => (
                        <AlbumSidebarCard
                          key={album.name}
                          album={album}
                          isSelected={selectedAlbum === album.name}
                          onPickAlbum={handlePickAlbumFromSidebar}
                          onContextMenu={(e, pickedAlbum) =>
                            openGroupContextMenu(e, 'album', pickedAlbum)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {playlist.length > 0 && listMode === 'artists' && selectedArtist === 'all' && (
                  <div className="artist-browser no-drag">
                    <div className="folder-browser-header">
                      <span className="folder-browser-title">
                        {t('artists.heading', 'Artists')}
                      </span>
                      <span className="folder-browser-count">({artistGroups.length})</span>
                    </div>
                    <div className="artist-grid">
                      {artistGroups.map((artist) => (
                        <ArtistSidebarCard
                          key={artist.name}
                          artist={artist}
                          isSelected={selectedArtist === artist.name}
                          onPickArtist={handlePickArtistFromSidebar}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {playlist.length > 0 && listMode === 'folders' && selectedFolder === 'all' && (
                  <div className="folder-browser no-drag">
                    <FolderTreeBrowser
                      folders={folderTreeFiltered}
                      selectedFolder={selectedFolder}
                      onPickFolder={handlePickFolderFromSidebar}
                      onOpenContextMenu={(event, folder) =>
                        openGroupContextMenu(event, 'folder', folder)
                      }
                    />
                  </div>
                )}

                {listMode === 'playlists' &&
                  selectedSmartCollectionId &&
                  selectedSmartCollection && (
                    <div
                      key={`smart-${selectedSmartCollectionId}`}
                      className="user-playlist-detail no-drag"
                    >
                      <div className="user-playlist-detail-head">
                        <button
                          type="button"
                          className="user-playlist-detail-back"
                          onClick={() => setSelectedSmartCollectionId(null)}
                          aria-label={t('aria.backToPlaylists')}
                          title={t('nav.back')}
                        >
                          <ChevronLeft size={20} strokeWidth={1.5} />
                        </button>
                        <div className="user-playlist-detail-text">
                          <span
                            className="user-playlist-detail-name"
                            title={selectedSmartCollection.name}
                          >
                            {selectedSmartCollection.name}
                          </span>
                          <span className="user-playlist-detail-meta">
                            {t('playlists.detailTrackCount', {
                              count: selectedSmartCollection.tracks.length
                            })}
                          </span>
                          {selectedSmartCollection.kind === 'custom' && (
                            <div className="smart-collection-rule-list">
                              {describeSmartCollectionRules(selectedSmartCollection.rules).map(
                                (item) => (
                                  <span key={item} className="smart-collection-rule-chip">
                                    {item}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="user-playlist-detail-actions">
                        <button
                          type="button"
                          className="user-playlist-detail-btn user-playlist-detail-btn--primary"
                          onClick={() => playPlaylistContextNow()}
                        >
                          <Play size={14} aria-hidden />
                          {t('playlists.playAll', { defaultValue: 'Play all' })}
                        </button>
                        <button
                          type="button"
                          className="user-playlist-detail-btn"
                          onClick={() => playPlaylistContextNow({ shuffle: true })}
                        >
                          <Shuffle size={14} aria-hidden />
                          {t('playlists.shufflePlay', { defaultValue: 'Shuffle' })}
                        </button>
                        {selectedSmartCollection.kind === 'custom' ? (
                          <>
                            <button
                              type="button"
                              className="user-playlist-detail-btn"
                              onClick={() =>
                                openEditSmartCollectionEditor(selectedSmartCollection.id)
                              }
                            >
                              <Pencil size={14} aria-hidden />
                              {t('playlists.editSmartCollection', 'Edit smart collection')}
                            </button>
                            <button
                              type="button"
                              className="user-playlist-detail-btn"
                              onClick={() => deleteSmartCollection(selectedSmartCollection.id)}
                            >
                              <Trash2 size={14} aria-hidden />
                              {t('playlists.deleteSmartCollection', 'Delete smart collection')}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="user-playlist-detail-btn"
                            disabled
                            style={{ opacity: 0.65 }}
                          >
                            <History size={14} aria-hidden />
                            {t('playlists.readonlyCollection', 'Read only')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                {listMode === 'playlists' && selectedUserPlaylistId && selectedUserPlaylist && (
                  <div
                    key={`playlist-${selectedUserPlaylistId}`}
                    className="user-playlist-detail no-drag"
                  >
                    <div className="user-playlist-detail-head">
                      <button
                        type="button"
                        className="user-playlist-detail-back"
                        onClick={() => setSelectedUserPlaylistId(null)}
                        aria-label={t('aria.backToPlaylists')}
                        title={t('nav.back')}
                      >
                        <ChevronLeft size={20} strokeWidth={1.5} />
                      </button>
                      <div className="user-playlist-detail-text">
                        <span
                          className="user-playlist-detail-name"
                          title={selectedUserPlaylist.name}
                        >
                          {selectedUserPlaylist.name}
                        </span>
                        <span className="user-playlist-detail-meta">
                          {t('playlists.detailTrackCount', {
                            count: selectedUserPlaylist.paths.length
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="user-playlist-detail-actions">
                      <button
                        type="button"
                        className="user-playlist-detail-btn user-playlist-detail-btn--primary"
                        onClick={() => playPlaylistContextNow()}
                      >
                        <Play size={14} aria-hidden />
                        {t('playlists.playAll', { defaultValue: 'Play all' })}
                      </button>
                      <button
                        type="button"
                        className="user-playlist-detail-btn"
                        onClick={() => playPlaylistContextNow({ shuffle: true })}
                      >
                        <Shuffle size={14} aria-hidden />
                        {t('playlists.shufflePlay', { defaultValue: 'Shuffle' })}
                      </button>
                      <button
                        type="button"
                        className="user-playlist-detail-btn"
                        onClick={importAudioIntoSelectedUserPlaylist}
                        title={t('playlists.importTitle')}
                      >
                        <Upload size={14} aria-hidden />
                        {t('playlists.import')}
                      </button>
                      <button
                        type="button"
                        className="user-playlist-detail-btn"
                        onClick={async () => {
                          await exportNamedUserPlaylists(
                            [selectedUserPlaylist],
                            `${selectedUserPlaylist.name.replace(/[^\w.-]+/g, '_')}.json`
                          )
                        }}
                      >
                        <Download size={14} aria-hidden />
                        {t('playlists.export')}
                      </button>
                      <button
                        type="button"
                        className="user-playlist-detail-btn"
                        onClick={() => exportUserPlaylistM3U(selectedUserPlaylist.id)}
                      >
                        <Download size={14} aria-hidden />
                        {t('playlists.exportM3U')}
                      </button>
                      <button
                        type="button"
                        className="user-playlist-detail-btn"
                        onClick={() => exportUserPlaylistText(selectedUserPlaylist)}
                      >
                        <Download size={14} aria-hidden />
                        {t('playlists.exportText')}
                      </button>
                    </div>
                  </div>
                )}

                {showTrackList && (
                  <>
                    {tracksForSidebarListFiltered.length === 0 && (
                      <div className="app-empty-state app-empty-state--minimal sidebar-empty-hint">
                        <p className="app-empty-state__title">
                          {showLikedOnly
                            ? t('empty.noLikedInView')
                            : listMode === 'playlists'
                              ? t(
                                  selectedSmartCollectionId
                                    ? 'empty.smartCollectionEmpty'
                                    : 'empty.playlistEmpty',
                                  selectedSmartCollectionId
                                    ? 'No tracks in this collection yet.'
                                    : undefined
                                )
                              : t('empty.noSearchMatch')}
                        </p>
                      </div>
                    )}
                    {tracksForSidebarListFiltered.length > 0 && (
                      <div
                        key={
                          listMode === 'artists' && selectedArtist !== 'all'
                            ? `artist-${selectedArtist}`
                            : listMode === 'album' && selectedAlbum !== 'all'
                              ? selectedAlbum
                              : 'sidebar-list'
                        }
                        className={`playlist-virtual-list${listMode === 'album' && selectedAlbum !== 'all' ? ' playlist-virtual-list--album-enter' : ''}${listMode === 'artists' && selectedArtist !== 'all' ? ' playlist-virtual-list--artist-detail' : ''}${artistDetailLeaving ? ' playlist-virtual-list--artist-leaving' : ''}`}
                      >
                        {visibleSidebarRange.topSpacer > 0 && (
                          <div
                            className="playlist-spacer"
                            style={{ height: `${visibleSidebarRange.topSpacer}px` }}
                            aria-hidden
                          />
                        )}
                        {visibleSidebarTracks.map((track) => {
                          const displayArtist =
                            track.info.artist === 'Unknown Artist'
                              ? albumArtistByName[track.info.album] || track.info.artist
                              : track.info.artist
                          const trackExt = String(track.name || track.path || '')
                            .split('.')
                            .pop()
                            ?.toUpperCase()
                          const formatLabel =
                            trackExt &&
                            trackExt.length <= 5 &&
                            trackExt !== String(track.name || track.path || '').toUpperCase()
                              ? trackExt
                              : ''
                          const durationLabel =
                            track.info.duration && track.info.duration > 0
                              ? formatTime(track.info.duration)
                              : ''
                          const trackMeta = effectiveTrackMetaMap[track.path] || {}
                          const selectedForDrag = selectedSidebarTrackPathSet.has(track.path)

                          const liked = likedSet.has(track.path)
                          const inUpNext = upNextPathSet.has(track.path)
                          return (
                            <div
                              key={`${track.path}-${track.originalIdx}`}
                              className={`track-item${track.originalIdx === currentIndex ? ' active' : ''}${selectedForDrag ? ' track-item--selected' : ''}${listMode === 'playlists' && (selectedUserPlaylistId || selectedSmartCollectionId) ? ' track-item--in-pl' : ''}`}
                              data-track-index={track.originalIdx}
                              data-track-path={track.path}
                              draggable
                              onDragStart={(e) => {
                                const dragPaths =
                                  selectedForDrag && selectedSidebarTrackPaths.length > 1
                                    ? selectedSidebarTrackPaths
                                    : [track.path]
                                e.dataTransfer.effectAllowed = 'copy'
                                e.dataTransfer.setData('application/x-echo-track-path', track.path)
                                e.dataTransfer.setData(
                                  'application/x-echo-track-paths',
                                  JSON.stringify(dragPaths)
                                )
                                e.dataTransfer.setData('text/plain', track.path)
                              }}
                              onClick={(event) => {
                                if (handleSidebarTrackSelectionClick(track, event)) return
                                setSelectedSidebarTrackPaths([])
                                lastSelectedSidebarTrackPathRef.current = ''
                                startPlaybackForTrack(track, sidebarPlaybackContext)
                              }}
                              onContextMenu={(e) => {
                                e?.preventDefault?.()
                                const { clientX, clientY } = resolveContextMenuPoint(e)
                                forceCloseCoverContextMenu()
                                forceCloseGroupContextMenu()
                                forceCloseAddToPlaylistMenu()
                                setTrackContextMenu({ clientX, clientY, track })
                              }}
                            >
                              <div
                                className={`track-art${track.originalIdx === currentIndex ? ' track-art--playing' : ''}`}
                                aria-hidden
                              >
                                {track.info.cover ? (
                                  <img src={track.info.cover} alt="" draggable={false} />
                                ) : (
                                  <Music size={17} />
                                )}
                              </div>
                              <div className="track-text-group">
                                <div className="track-name" title={track.info.title}>
                                  {track.originalIdx === currentIndex && (
                                    <span className="track-playing-dot" aria-hidden />
                                  )}
                                  {track.info.title}
                                </div>
                                <div
                                  className="track-subtitle"
                                  title={`${displayArtist} - ${track.info.album}`}
                                >
                                  <ArtistLink
                                    artist={displayArtist}
                                    className="artist-link-subtle"
                                    stopPropagation
                                    noLink
                                  />{' '}
                                  - {track.info.album}
                                </div>
                                <div className="track-meta-pills" aria-hidden>
                                  <AudioQualityBadges
                                    quality={{
                                      codec: trackMeta.codec || formatLabel || null,
                                      bitrateKbps: trackMeta.bitrateKbps || null,
                                      sampleRateHz: trackMeta.sampleRateHz || null,
                                      bitDepth: trackMeta.bitDepth || null,
                                      channels: trackMeta.channels || null,
                                      isMqa: trackMeta.isMqa === true,
                                      bpm: trackMeta.bpm || null
                                    }}
                                    compact
                                  />
                                </div>
                              </div>
                              <div className="track-row-meta" aria-hidden>
                                {durationLabel && <span>{durationLabel}</span>}
                              </div>
                              {(listMode === 'songs' ||
                                listMode === 'folders' ||
                                listMode === 'artists' ||
                                listMode === 'album' ||
                                (listMode === 'playlists' &&
                                  (selectedUserPlaylistId || selectedSmartCollectionId))) && (
                                <div className="track-add-pl-wrap">
                                  <button
                                    type="button"
                                    className={`track-like-btn ${liked ? 'active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleLike(track.path)
                                    }}
                                    title={liked ? t('like.unlike') : t('like.like')}
                                    aria-pressed={liked}
                                  >
                                    <Heart
                                      size={16}
                                      fill={liked ? 'currentColor' : 'none'}
                                      strokeWidth={liked ? 1.5 : 1.5}
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    className={`track-add-pl-btn track-queue-btn ${inUpNext ? 'active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (inUpNext) {
                                        removeFromUpNextQueue(track.path)
                                      } else {
                                        enqueueUpNextTrack(track)
                                      }
                                    }}
                                    title={
                                      inUpNext
                                        ? t('contextMenu.removeFromUpNext')
                                        : t('queue.contextMenu.addToQueue', 'Add to Queue')
                                    }
                                    aria-pressed={inUpNext}
                                  >
                                    <ListPlus size={16} />
                                  </button>
                                  {listMode === 'playlists' && selectedUserPlaylistId && (
                                    <button
                                      type="button"
                                      className="track-remove-pl-btn"
                                      title={t('aria.removeFromPlaylist')}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        removePathFromUserPlaylist(
                                          selectedUserPlaylistId,
                                          track.path
                                        )
                                      }}
                                    >
                                      <Minus size={16} />
                                    </button>
                                  )}
                                  {(listMode === 'songs' ||
                                    listMode === 'folders' ||
                                    listMode === 'artists' ||
                                    listMode === 'album') && (
                                    <button
                                      type="button"
                                      className={`track-add-pl-btn track-playlist-btn ${addToPlaylistMenu?.originalIdx === track.originalIdx ? 'active' : ''}`}
                                      onClick={(e) => openAddToPlaylistPopover(e, track)}
                                      title={t('aria.addToPlaylist')}
                                    >
                                      <Plus size={16} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {visibleSidebarRange.bottomSpacer > 0 && (
                          <div
                            className="playlist-spacer"
                            style={{ height: `${visibleSidebarRange.bottomSpacer}px` }}
                            aria-hidden
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {sidebarScrollbarMetrics.visible ? (
                <div
                  className="playlist-scrollbar"
                  aria-hidden
                  onPointerDown={handleSidebarScrollbarPointerDown}
                  onPointerMove={handleSidebarScrollbarPointerMove}
                  onPointerUp={handleSidebarScrollbarPointerUp}
                  onPointerCancel={handleSidebarScrollbarPointerUp}
                >
                  <div
                    className="playlist-scrollbar-thumb"
                    style={{
                      height: sidebarScrollbarMetrics.thumbHeight,
                      transform: `translateY(${sidebarScrollbarMetrics.thumbTop}px)`
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <PluginSlot name="sidebar" />
        </div>

        <div
          className={`main-player glass-panel ${showLyrics ? 'lyrics-mode' : 'no-drag'} ${brightLyricsBackdrop ? 'immersive-mode' : ''} ${showLyrics && !brightLyricsBackdrop ? 'main-player--lyrics-fallback-bg' : ''} ${lyricsBackgroundPresentation?.className || ''} ${brightLyricsBackdrop ? 'main-player--bright-lyrics-bg' : ''} ${view === 'settings' || (!showLyrics && !showLegacyMainPlayerChrome) ? 'hidden' : ''} ${config.lyricsBlurEffect ? 'lyrics-blur-on' : ''} ${config.lyricsReadabilityEnhancement === true ? 'lyrics-readable-text' : ''}`}
          style={lyricsBackgroundPresentation?.style}
        >
          {showLyrics ? (
            <div className="lyrics-view-container" style={lyricsPanelStyle}>
              {!hideImmersiveMvChrome && (
                <>
                  <button className="back-btn" onClick={() => setShowLyrics(false)}>
                    <ChevronLeft size={32} />
                  </button>

                  <div className="lyrics-header">
                    <div className="mini-cover">
                      {displaySafeCoverUrl ? (
                        <img src={displaySafeCoverUrl} alt="" onError={handleDisplayCoverError} />
                      ) : (
                        <Music />
                      )}
                    </div>
                    <div className="lyrics-meta">
                      <h2>{displayMainTitle}</h2>
                      <p>
                        <ArtistLink artist={displayMainArtist} className="artist-link-lyrics" />
                      </p>
                      <div className="technical-info-mini">
                        <span
                          className={`mini-pill lyrics-sync-pill lyrics-sync-pill--${lyricsStatusUi.tone}`}
                        >
                          {lyricsStatusUi.text}
                        </span>
                        <StreamingPlaybackTags track={currentTrack} variant="mini" />
                        {dlnaUiOn && (
                          <span
                            className="mini-pill"
                            style={{
                              fontWeight: 800,
                              letterSpacing: '0.06em',
                              borderColor: 'var(--accent-pink)',
                              color: 'var(--accent-pink)'
                            }}
                          >
                            {castPillLabel}
                          </span>
                        )}
                        {technicalInfo.codec && (
                          <span className="mini-pill">{technicalInfo.codec.toUpperCase()}</span>
                        )}
                        {technicalInfo.bitrate && (
                          <span className="mini-pill">
                            {Math.round(technicalInfo.bitrate / 1000)} kbps
                          </span>
                        )}
                        {technicalInfo.sampleRate && (
                          <span className="mini-pill">{technicalInfo.sampleRate} Hz</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {hideImmersiveMvChrome && (
                <button
                  type="button"
                  className="immersive-mv-minimal-exit no-drag"
                  onClick={() => setShowLyrics(false)}
                  title={t('mvDrawer.exitImmersiveLyrics')}
                  aria-label={t('mvDrawer.exitImmersiveLyrics')}
                >
                  <ChevronLeft size={28} />
                </button>
              )}

              <div
                className={`lyrics-and-mv-wrapper${isLyricsListHidden ? ' lyrics-and-mv-wrapper--lyrics-hidden' : ''}${!isSideMvVisibleInLyrics ? ' lyrics-and-mv-wrapper--lyrics-solo' : ''}`}
              >
                <div
                  className={`lyrics-main-column${lyricsDropActive ? ' lyrics-main-column--lrc-drop-active' : ''}${lyricsDropMessage ? ' lyrics-main-column--lrc-drop-message' : ''}`}
                  onDragEnter={handleLyricsDropDragEnter}
                  onDragOver={handleLyricsDropDragOver}
                  onDragLeave={handleLyricsDropDragLeave}
                  onDrop={handleLyricsDrop}
                >
                  <div
                    className="lyrics-lrc-drop-overlay"
                    aria-hidden={!lyricsDropActive && !lyricsDropMessage}
                  >
                    <div className="lyrics-lrc-drop-card">
                      <Upload size={24} strokeWidth={1.7} />
                      <span>
                        {lyricsDropMessage ||
                          (lyricsDropActive
                            ? t('lyrics.dropLrcRelease')
                            : t('lyrics.dropLrcPrompt'))}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`lyrics-quick-actions${lyricsQuickBarDismissed ? ' lyrics-quick-actions--hidden' : ''}`}
                  >
                    <div className="lyrics-quick-actions__inner">
                      <span className="lyrics-quick-actions__prompt">
                        {t('lyrics.quickFixPrompt')}
                      </span>
                      <button
                        type="button"
                        className="lyrics-quick-actions__button"
                        onClick={() => openLyricsCandidatePicker()}
                      >
                        {t('lyrics.quickPickManual')}
                      </button>
                      <button
                        type="button"
                        className="lyrics-quick-actions__button"
                        disabled={config.lyricsHidden}
                        title={config.lyricsHidden ? t('lyrics.desktopLyricsHint') : undefined}
                        onClick={() => {
                          if (config.lyricsHidden) return
                          if (isCurrentTrackLyricsTemporarilyHidden) {
                            setTemporarilyHiddenLyricsTrackPath('')
                            setLyricsQuickBarDismissed(false)
                            setLyricsQuickBarActivityAt(Date.now())
                            return
                          }
                          setLyricsQuickBarDismissed(true)
                          setTemporarilyHiddenLyricsTrackPath(currentTrackPath)
                        }}
                      >
                        {isCurrentTrackLyricsTemporarilyHidden
                          ? t('lyrics.quickShowForTrack')
                          : t('lyrics.quickHideForTrack')}
                      </button>
                      {mvId && shouldLoadActiveMvMedia && (
                        <button
                          type="button"
                          className="lyrics-quick-actions__button"
                          onClick={() => {
                            if (isCurrentTrackMvTemporarilyHidden) {
                              setTemporarilyHiddenMvTrackPath('')
                              setLyricsQuickBarDismissed(false)
                              setLyricsQuickBarActivityAt(Date.now())
                              return
                            }
                            setLyricsQuickBarDismissed(false)
                            setLyricsQuickBarActivityAt(Date.now())
                            setTemporarilyHiddenMvTrackPath(currentTrackPath)
                          }}
                        >
                          {isCurrentTrackMvTemporarilyHidden
                            ? t('lyrics.quickShowMvForTrack')
                            : t('lyrics.quickHideMvForTrack')}
                        </button>
                      )}
                    </div>
                  </div>

                  {!isLyricsListHidden && (
                    <div className="lyrics-scroll-area" ref={scrollAreaRef}>
                      {lyrics.length > 0 ? (
                        lyrics.map((line, idx) => (
                          <div
                            key={idx}
                            className={`lyric-line ${idx === activeLyricIndex ? 'active' : ''} ${idx < activeLyricIndex ? 'past' : ''} ${Math.abs(idx - activeLyricIndex) === 1 ? 'near' : ''} ${Math.abs(idx - activeLyricIndex) >= 2 ? 'far' : ''}`}
                            style={{
                              fontSize: `${config.lyricsFontSize ?? 32}px`
                            }}
                            onClick={() => {
                              const newTime = parseFloat(line.time)
                              if (isNaN(newTime)) return

                              setIsSeeking(true)
                              setCurrentTime(newTime)
                              markLyricsSeekJump(newTime)
                              syncYTVideo(newTime)

                              // Clear existing timer
                              if (seekTimerRef.current) clearTimeout(seekTimerRef.current)

                              if (
                                useNativeEngineRef.current &&
                                (window.api?.seekAudio || window.api?.playAudio)
                              ) {
                                const tp = playlist[currentIndex]?.path
                                if (audioRef.current) audioRef.current.currentTime = newTime
                                if (tp) seekNativePlayback(tp, newTime).catch(console.error)
                                seekTimerRef.current = setTimeout(() => setIsSeeking(false), 500)
                              } else if (audioRef.current) {
                                audioRef.current.currentTime = newTime
                                seekTimerRef.current = setTimeout(() => setIsSeeking(false), 500)
                              }
                            }}
                          >
                            {config.lyricsWordHighlight !== false && lyricTimelineValid ? (
                              lyricKaraokeStateList[idx]?.tokens?.length ? (
                                <span className="lyric-line-main lyric-line-main--karaoke">
                                  {lyricKaraokeStateList[idx].tokens.map((token, tokenIdx) => {
                                    const tokenProgress = Math.max(
                                      0,
                                      Math.min(1, Number(token?.progress) || 0)
                                    )
                                    return (
                                      <span
                                        key={`${idx}-${tokenIdx}`}
                                        className={`lyric-karaoke-token${tokenProgress >= 1 ? ' is-past' : ''}${tokenProgress > 0 && tokenProgress < 1 ? ' is-active' : ''}`}
                                        style={{
                                          '--token-progress': `${(tokenProgress * 100).toFixed(3)}%`
                                        }}
                                      >
                                        {token?.text || ''}
                                      </span>
                                    )
                                  })}
                                </span>
                              ) : (
                                <span className="lyric-line-main">{line.text}</span>
                              )
                            ) : (
                              <span className="lyric-line-main">{line.text}</span>
                            )}
                            {config.lyricsShowRomaji && (romajiDisplayLines[idx] || line.romaji) ? (
                              <span className="lyric-line-romaji">
                                {line.romaji || romajiDisplayLines[idx]}
                              </span>
                            ) : null}
                            {config.lyricsShowTranslation && line.translation ? (
                              <span className="lyric-line-translation">{line.translation}</span>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="lyric-line active" style={{ opacity: 0.5 }}>
                          {isSearchingMV ? (
                            t('lyrics.searchingMv')
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 8
                              }}
                            >
                              <div>{t('lyrics.none')}</div>
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  justifyContent: 'center'
                                }}
                              >
                                <button
                                  className="retry-lyrics-btn"
                                  onClick={() => retryFetchLyrics()}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: 'var(--accent-color)',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {t('lyrics.fetchAgain')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openLyricsCandidatePicker()}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: 'inherit',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {t('lyrics.pickManual')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isSideMvVisibleInLyrics && (
                  <div ref={mvContainerRef} className="mv-container glass-panel">
                    <div className="mv-aspect-ratio-wrapper">
                      {mvId.source === 'bilibili' && biliDirectStream?.videoUrl ? (
                        renderMvIframe(mvId, false)
                      ) : (
                        <div className="mv-hi-res-stage">{renderMvIframe(mvId, false)}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : showLegacyMainPlayerChrome ? (
            <div className="main-player-body">
              <div
                className={`cover-wrapper${quickEditModifierActive ? ' quick-edit-target quick-edit-target--armed' : ''}`}
                onContextMenu={openCoverContextMenu}
                onClick={handleQuickCoverPick}
                title={
                  currentTrack?.path && isLocalAudioFilePath(currentTrack.path)
                    ? t('metadataQuick.coverHint', 'Ctrl+click to change cover')
                    : undefined
                }
              >
                {displaySafeCoverUrl ? (
                  <img
                    src={displaySafeCoverUrl}
                    draggable={false}
                    className={`cover-image ${transportIsPlaying ? 'playing' : ''}`}
                    alt={t('lyrics.coverAlt')}
                    onError={handleDisplayCoverError}
                  />
                ) : (
                  <div className="no-cover">
                    <Music size={64} style={{ opacity: 0.3 }} />
                  </div>
                )}
              </div>

              <div className="track-info">
                <h1
                  className={
                    quickEditModifierActive ? 'quick-edit-target quick-edit-target--armed' : ''
                  }
                  onClick={(event) => handleQuickFieldTrigger('title', event)}
                  title={
                    currentTrack?.path && isLocalAudioFilePath(currentTrack.path)
                      ? t('metadataQuick.titleHint', 'Ctrl+click to edit title')
                      : undefined
                  }
                >
                  {quickEditField === 'title' ? (
                    <input
                      className="quick-edit-input quick-edit-input--title"
                      value={quickEditDraft}
                      onChange={(event) => setQuickEditDraft(event.target.value)}
                      onBlur={() => {
                        void commitQuickMetadataFieldEdit()
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.currentTarget.blur()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelQuickMetadataFieldEdit()
                        }
                      }}
                      autoFocus
                      disabled={quickEditBusy}
                    />
                  ) : (
                    displayMainTitle
                  )}
                </h1>
                <p
                  className={`artist-text${quickEditModifierActive ? ' quick-edit-target quick-edit-target--armed' : ''}`}
                  onClickCapture={(event) => handleQuickFieldTrigger('artist', event)}
                  title={
                    currentTrack?.path && isLocalAudioFilePath(currentTrack.path)
                      ? t('metadataQuick.artistHint', 'Ctrl+click to edit artist')
                      : undefined
                  }
                >
                  {quickEditField === 'artist' ? (
                    <input
                      className="quick-edit-input quick-edit-input--artist"
                      value={quickEditDraft}
                      onChange={(event) => setQuickEditDraft(event.target.value)}
                      onBlur={() => {
                        void commitQuickMetadataFieldEdit()
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.currentTarget.blur()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelQuickMetadataFieldEdit()
                        }
                      }}
                      autoFocus
                      disabled={quickEditBusy}
                    />
                  ) : (
                    <ArtistLink artist={displayMainArtist} className="artist-link-main" />
                  )}
                </p>

                <div className="tech-pills-container">
                  <StreamingPlaybackTags track={currentTrack} variant="main" />
                  {isListenTogetherLoading && (
                    <div
                      className="tech-pill"
                      style={{
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        fontSize: 11,
                        borderColor: 'var(--accent-pink)',
                        color: 'var(--accent-pink)',
                        boxShadow: '0 0 12px rgba(236, 72, 153, 0.25)',
                        animation: 'pulse 1.5s infinite'
                      }}
                    >
                      [Together] LOADING...
                    </div>
                  )}
                  {dlnaUiOn && (
                    <div
                      className="tech-pill"
                      style={{
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        fontSize: 11,
                        borderColor: 'var(--accent-pink)',
                        color: 'var(--accent-pink)',
                        boxShadow: '0 0 12px rgba(236, 72, 153, 0.25)'
                      }}
                    >
                      {castPillLabel}
                    </div>
                  )}
                  {technicalInfo.codec && (
                    <div className="tech-pill codec-pill">{technicalInfo.codec.toUpperCase()}</div>
                  )}
                  {technicalInfo.bitrate && (
                    <div className="tech-pill">{Math.round(technicalInfo.bitrate / 1000)}kbps</div>
                  )}
                  {technicalInfo.sampleRate && (
                    <div
                      className={`tech-pill ${technicalInfo.sampleRate > 44100 || technicalInfo.bitrate > 500000 ? 'lossless-glow' : ''}`}
                    >
                      {(technicalInfo.sampleRate > 44100 || technicalInfo.bitrate > 500000) && (
                        <Zap size={14} style={{ marginRight: 4 }} />
                      )}
                      {technicalInfo.sampleRate / 1000}KHZ
                    </div>
                  )}
                  {technicalInfo.channels && (
                    <div className="tech-pill">
                      {technicalInfo.channels > 1 ? t('tech.stereo') : t('tech.mono')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {showLegacyMainPlayerChrome && !(showLyrics && hideImmersiveMvChrome) && (
            <div className="controls-container">
              <PlayerProgressControl
                position={displayProgressTime}
                duration={displayProgressDuration}
                isPlaying={transportIsPlaying}
                playbackRate={playbackRate}
                isDragging={isProgressDragging}
                disabled={dlnaUiOn}
                unknownDuration={dlnaUiOn && (!displayProgressDuration || displayProgressDuration <= 0)}
                onSeekChange={handleSeek}
                onSeekStart={(value) => {
                  progressSeekValueRef.current = value
                  isProgressDraggingRef.current = true
                  setIsSeeking(true)
                  setIsProgressDragging(true)
                }}
                onSeekCommit={commitProgressSeek}
              />

              <div className="buttons buttons--transport">
                <div className="transport-cluster transport-cluster--primary">
                  <button
                    className={`btn btn--transport play-mode-toggle ${playMode === 'shuffle' ? 'is-active' : ''}`}
                    style={{ width: 40, height: 40 }}
                    onClick={() => setPlayMode(playMode === 'shuffle' ? 'loop' : 'shuffle')}
                    aria-pressed={playMode === 'shuffle'}
                  >
                    <Shuffle size={18} color="currentColor" />
                  </button>
                  <button className="btn btn--transport" onClick={handlePrev}>
                    <SkipBack size={24} color="var(--text-soft)" />
                  </button>
                  <button className="btn play-btn" onClick={togglePlay}>
                    {transportIsPlaying ? (
                      <Pause size={32} />
                    ) : (
                      <Play size={32} style={{ marginLeft: 4 }} />
                    )}
                  </button>
                  <button className="btn btn--transport" onClick={handleNext}>
                    <SkipForward size={24} color="var(--text-soft)" />
                  </button>
                  <button
                    className="btn btn--transport"
                    style={{ width: 40, height: 40 }}
                    onClick={() => setPlayMode(playMode === 'single' ? 'loop' : 'single')}
                  >
                    {playMode === 'single' ? (
                      <Repeat1 size={18} color="var(--accent-pink)" />
                    ) : (
                      <Repeat
                        size={18}
                        color={playMode === 'loop' ? 'var(--accent-pink)' : 'var(--text-soft)'}
                      />
                    )}
                  </button>
                </div>

                <div className="transport-cluster transport-cluster--utility">
                  <button
                    className={`btn btn--transport lyrics-toggle ${showLyrics ? 'active' : ''}`}
                    style={{ width: 40, height: 40 }}
                    onClick={() => setShowLyrics(!showLyrics)}
                  >
                    <Mic2
                      size={18}
                      color={showLyrics ? 'var(--accent-pink)' : 'var(--text-soft)'}
                    />
                  </button>
                  <PluginSlot
                    name="playerTransportExtras"
                    context={playerTransportPluginContext}
                    className="no-drag transport-plugin-slot"
                    style={{ display: 'flex', alignItems: 'center' }}
                  />
                </div>
              </div>

              <div className="nightcore-controls deck-panel">
                <div className="nc-header">
                  <span>{t('player.speed')}</span>
                  <span className="nc-badge">{playbackRate.toFixed(2)}x</span>
                </div>
                <div
                  className={`slider-wrapper deck-slider-row ${isSpeedDragging ? 'is-dragging' : ''}`}
                  style={{ marginBottom: view === 'player' && !showLyrics ? 8 : 0 }}
                >
                  <span className="deck-scale-label">0.5</span>
                  <input
                    type="range"
                    className={`deck-slider ${isSpeedDragging ? 'is-dragging' : ''}`}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                    onMouseDown={() => setIsSpeedDragging(true)}
                    onMouseUp={() => setIsSpeedDragging(false)}
                    onMouseLeave={() => setIsSpeedDragging(false)}
                    onTouchStart={() => setIsSpeedDragging(true)}
                    onTouchEnd={() => setIsSpeedDragging(false)}
                  />
                  <span className="deck-scale-label">2.0</span>
                </div>

                <div className="deck-divider" role="presentation" />

                <div className="nc-header" style={{ marginLeft: showLyrics ? 8 : 0 }}>
                  <span>{t('player.vol')}</span>
                  <span className="nc-badge">{Math.round(volume * 100)}%</span>
                </div>
                <div
                  className={`slider-wrapper deck-slider-row ${isVolumeDragging ? 'is-dragging' : ''}`}
                >
                  <Volume2 className="deck-vol-icon" size={16} aria-hidden />
                  <input
                    type="range"
                    className={`deck-slider ${isVolumeDragging ? 'is-dragging' : ''}`}
                    min={0.0}
                    max={1.0}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    onMouseDown={() => setIsVolumeDragging(true)}
                    onMouseUp={() => setIsVolumeDragging(false)}
                    onMouseLeave={() => setIsVolumeDragging(false)}
                    onTouchStart={() => setIsVolumeDragging(true)}
                    onTouchEnd={() => setIsVolumeDragging(false)}
                  />
                </div>

                <button
                  className="export-btn"
                  style={{ marginTop: 8 }}
                  onClick={handleExport}
                  disabled={isExporting || !currentTrack}
                >
                  <Download size={16} />
                  {isExporting ? t('player.exportRendering') : t('player.exportButton')}
                </button>
              </div>
            </div>
          )}
        </div>
        {view === 'settings' && (
          <div className="settings-page glass-panel no-drag">
            <div className="settings-header">
              <button className="back-view-btn" onClick={() => setView('player')}>
                <ChevronLeft size={32} />
              </button>
              <h1>{t('settings.pageTitle')}</h1>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 520,
                  marginTop: 12
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-soft)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  ref={settingsSearchInputRef}
                  type="text"
                  value={settingsQuery}
                  onChange={(e) => setSettingsQuery(e.target.value)}
                  placeholder={t('settings.searchPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 36px',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    color: 'inherit',
                    outline: 'none'
                  }}
                />
                {settingsQuery ? (
                  <button
                    type="button"
                    onClick={() => setSettingsQuery('')}
                    aria-label={t('aria.close')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      border: 'none',
                      borderRadius: 999,
                      background: 'transparent',
                      color: 'var(--text-soft)',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="settings-body">
              <nav className="settings-nav" aria-label={t('settings.pageTitle')}>
                {settingsNavItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeSettingsSection === item.key
                  const isDanger = item.key === 'danger'
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`settings-nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleSettingsNavClick(item.key, item.id)}
                      style={{
                        color: isDanger ? '#ff4d4f' : undefined,
                        borderLeftColor: isActive
                          ? isDanger
                            ? '#ff4d4f'
                            : 'var(--accent-pink)'
                          : 'transparent'
                      }}
                    >
                      <Icon size={16} />
                      <span className="settings-nav-copy">
                        <span className="settings-nav-label">{item.label}</span>
                        <span className="settings-nav-desc">{item.description}</span>
                      </span>
                    </button>
                  )
                })}
              </nav>

              <div className="settings-scroll-shell">
                <div
                  className="settings-content settings-content--custom-scrollbar"
                  ref={settingsContentRef}
                >
                  {!settingsHasResults ? (
                    <div
                      style={{
                        textAlign: 'center',
                        opacity: 0.5,
                        fontSize: 14,
                        padding: '24px 0'
                      }}
                    >
                      {t('settings.searchNoResults')}
                    </div>
                  ) : null}
                  <div
                    id="settings-sec-language"
                    data-settings-section="language"
                    style={{ display: settingsSectionVisibility.language ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title">
                        <MessageSquare size={20} />
                        <h2>{t('settings.nav.general')}</h2>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <p style={{ opacity: 0.85, marginTop: 0 }}>
                            {t('settings.languageHint')}
                          </p>
                        </div>
                        <div className="settings-chip-row no-drag">
                          {UI_LOCALES.map((code) => (
                            <button
                              key={code}
                              type="button"
                              className={`list-filter-chip ${normalizeUiLocale(config.uiLocale) === code ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiLocale: normalizeUiLocale(code)
                                }))
                              }
                            >
                              {code === 'en'
                                ? t('settings.langEn')
                                : code === 'zh'
                                  ? t('settings.langZh')
                                  : code === 'zh-TW'
                                    ? t('settings.langZhTw')
                                    : t('settings.langJa')}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.closeButtonBehaviorTitle')}</h3>
                          <p>{t('settings.closeButtonBehaviorDesc')}</p>
                        </div>
                        <div className="settings-chip-row no-drag">
                          {['tray', 'quit'].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={`list-filter-chip ${config.closeButtonBehavior === mode ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  closeButtonBehavior: mode
                                }))
                              }
                            >
                              {mode === 'tray'
                                ? t('settings.closeButtonBehaviorTray')
                                : t('settings.closeButtonBehaviorQuit')}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>
                            {t(
                              'settings.configBackupTitle',
                              '\u8bbe\u7f6e\u53c2\u6570\u5907\u4efd'
                            )}
                          </h3>
                          <p>
                            {t(
                              'settings.configBackupDesc',
                              '\u5bfc\u51fa\u6216\u5bfc\u5165 ECHO \u8bbe\u7f6e\u53c2\u6570\uff0c\u7528\u4e8e\u8fc1\u79fb\u5230\u65b0\u8bbe\u5907\u6216\u6062\u590d\u914d\u7f6e\u3002'
                            )}
                          </p>
                        </div>
                        <div className="settings-chip-row no-drag">
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={handleExportSettingsConfig}
                          >
                            <Download size={14} />
                            {t('settings.exportConfig', '\u5bfc\u51fa\u8bbe\u7f6e')}
                          </UiButton>
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={handleImportSettingsConfig}
                          >
                            <Upload size={14} />
                            {t('settings.importConfig', '\u5bfc\u5165\u8bbe\u7f6e')}
                          </UiButton>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div
                    id="settings-sec-engine"
                    data-settings-section="engine"
                    style={{ display: settingsSectionVisibility.engine ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title">
                        <Zap size={20} />
                        <h2>{t('settings.playbackAndAudio', '\u64ad\u653e\u4e0e\u97f3\u9891')}</h2>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.outputBufferTitle')}</h3>
                          <p>{t('settings.outputBufferDesc')}</p>
                        </div>
                        <div className="settings-chip-row no-drag">
                          {['low', 'balanced', 'stable'].map((key) => (
                            <button
                              key={key}
                              type="button"
                              className={`list-filter-chip ${config.audioOutputBufferProfile === key ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  audioOutputBufferProfile: key
                                }))
                              }
                            >
                              {t(`settings.outputBuffer.${key}`)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.gaplessTitle')}</h3>
                          <p>{t('settings.gaplessDesc')}</p>
                        </div>
                        <button
                          className={`toggle-btn ${config.gaplessEnabled ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({ ...prev, gaplessEnabled: !prev.gaplessEnabled }))
                          }
                        >
                          {config.gaplessEnabled ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.autoLocateCurrentTrackTitle')}</h3>
                          <p>{t('settings.autoLocateCurrentTrackDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.autoLocateCurrentTrack === true ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              autoLocateCurrentTrack: !prev.autoLocateCurrentTrack
                            }))
                          }
                        >
                          {config.autoLocateCurrentTrack === true ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.miniPlayerAlwaysOnTopTitle')}</h3>
                          <p>{t('settings.miniPlayerAlwaysOnTopDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.miniPlayerAlwaysOnTop !== false ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              miniPlayerAlwaysOnTop: prev.miniPlayerAlwaysOnTop === false
                            }))
                          }
                          aria-pressed={config.miniPlayerAlwaysOnTop !== false}
                        >
                          {config.miniPlayerAlwaysOnTop !== false ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.miniPlayerAutoHideMainWindowTitle')}</h3>
                          <p>{t('settings.miniPlayerAutoHideMainWindowDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.miniPlayerAutoHideMainWindow === true ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              miniPlayerAutoHideMainWindow:
                                prev.miniPlayerAutoHideMainWindow !== true
                            }))
                          }
                          aria-pressed={config.miniPlayerAutoHideMainWindow === true}
                        >
                          {config.miniPlayerAutoHideMainWindow === true ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.prevButtonModeTitle')}</h3>
                          <p>{t('settings.prevButtonModeDesc')}</p>
                        </div>
                        <div className="settings-chip-row">
                          {['playlist', 'history'].map((mode) => (
                            <button
                              key={mode}
                              className={`list-filter-chip ${config.prevButtonMode === mode ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({ ...prev, prevButtonMode: mode }))
                              }
                            >
                              {t(
                                `settings.prevButtonMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.sleepTimerTitle')}</h3>
                          <p>{t('settings.sleepTimerDesc')}</p>
                          {sleepTimerActive ? (
                            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-soft)' }}>
                              {config.sleepTimerMode === 'time'
                                ? t('settings.sleepTimerRemaining', {
                                    time: formatSleepTimerRemaining(sleepTimerRemainingMs)
                                  })
                                : t('settings.sleepTimerArmedTrack')}
                            </p>
                          ) : null}
                        </div>
                        <div
                          className="settings-chip-row no-drag"
                          style={{
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8
                          }}
                        >
                          {['time', 'track'].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={`list-filter-chip ${config.sleepTimerMode === mode ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  sleepTimerMode: mode
                                }))
                              }
                            >
                              {mode === 'time'
                                ? t('settings.sleepTimerModeTime')
                                : t('settings.sleepTimerModeTrack')}
                            </button>
                          ))}
                          {config.sleepTimerMode === 'time' ? (
                            <label className="settings-number-field">
                              <span>{t('settings.sleepTimerCustomMinutes')}</span>
                              <input
                                type="number"
                                min={SLEEP_TIMER_MINUTES_MIN}
                                max={SLEEP_TIMER_MINUTES_MAX}
                                step="1"
                                value={config.sleepTimerMinutes ?? ''}
                                onChange={(event) => {
                                  const raw = event.target.value
                                  setConfig((prev) => ({
                                    ...prev,
                                    sleepTimerMinutes:
                                      raw === ''
                                        ? ''
                                        : normalizeSleepTimerMinutes(raw, prev.sleepTimerMinutes || DEFAULT_CONFIG.sleepTimerMinutes)
                                  }))
                                }}
                                onBlur={() =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    sleepTimerMinutes: normalizeSleepTimerMinutes(prev.sleepTimerMinutes)
                                  }))
                                }
                                aria-label={t('settings.sleepTimerCustomMinutes')}
                              />
                            </label>
                          ) : null}
                          <UiButton
                            variant={sleepTimerActive ? 'ghost' : 'secondary'}
                            size="sm"
                            onClick={() => {
                              if (sleepTimerActive) {
                                cancelSleepTimer()
                                return
                              }
                              startSleepTimer()
                            }}
                          >
                            {sleepTimerActive
                              ? t('settings.sleepTimerCancel')
                              : t('settings.sleepTimerStart')}
                          </UiButton>
                        </div>
                      </div>

                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.crossfadeTitle')}</h3>
                          <p>{t('settings.crossfadeDesc')}</p>
                        </div>
                        <button
                          className={`toggle-btn ${config.crossfadeEnabled ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              crossfadeEnabled: !prev.crossfadeEnabled
                            }))
                          }
                        >
                          {config.crossfadeEnabled ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      {config.crossfadeEnabled ? (
                        <div className="setting-row" style={{ borderTop: 'none', paddingTop: 8 }}>
                          <div className="setting-info">
                            <h3>{t('settings.crossfadeDurationTitle')}</h3>
                            <p>{t('settings.crossfadeDurationDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              minWidth: 260,
                              justifyContent: 'flex-end'
                            }}
                          >
                            <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                              {t('settings.crossfadeSeconds', { count: config.crossfadeDuration })}
                            </span>
                            <input
                              type="range"
                              min={1}
                              max={12}
                              step={1}
                              value={config.crossfadeDuration}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  crossfadeDuration: Math.max(
                                    1,
                                    Math.min(12, Number.parseInt(e.target.value, 10) || 1)
                                  )
                                }))
                              }
                              style={{ width: 160 }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {isImmersiveLyricsMvEnabled(config) && (
                        <>
                          <div
                            className="setting-row"
                            style={{
                              marginTop: '8px',
                              borderTop: 'none',
                              paddingTop: 0
                            }}
                          >
                            <div className="setting-info">
                              <h3>{t('settings.lyricsShadowTitle')}</h3>
                              <p>{t('settings.lyricsShadowDesc')}</p>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  gap: 12
                                }}
                              >
                                <button
                                  className={`toggle-btn ${config.lyricsShadow ? 'active' : ''}`}
                                  onClick={() =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      lyricsShadow: !prev.lyricsShadow
                                    }))
                                  }
                                >
                                  {config.lyricsShadow ? (
                                    <ToggleRight size={28} />
                                  ) : (
                                    <ToggleLeft size={28} />
                                  )}
                                </button>
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  width: '220px'
                                }}
                              >
                                <span style={{ fontSize: 12, opacity: 0.5 }}>0%</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  value={
                                    config.lyricsShadowOpacity !== undefined
                                      ? config.lyricsShadowOpacity
                                      : 0.6
                                  }
                                  onChange={(e) =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      lyricsShadowOpacity: parseFloat(e.target.value)
                                    }))
                                  }
                                  style={{ flex: 1 }}
                                />
                                <span style={{ fontSize: 12, opacity: 0.5 }}>100%</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </section>
                  </div>

                  <div
                    id="settings-sec-integrations"
                    data-settings-section="integrations"
                    style={{ display: settingsSectionVisibility.integrations ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title">
                        <Zap size={20} />
                        <h2>{t('settings.nav.connections')}</h2>
                      </div>
                      <AccountLoginSettings
                        config={config}
                        setConfig={setConfig}
                        signInStatus={signInStatus}
                        onRefreshSignInStatus={refreshSignInStatus}
                      />
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.discordTitle')}</h3>
                          <p>{t('settings.discordDesc')}</p>
                        </div>
                        <button
                          className={`toggle-btn ${config.enableDiscordRPC ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              enableDiscordRPC: !prev.enableDiscordRPC
                            }))
                          }
                        >
                          {config.enableDiscordRPC ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('remote.settingsTitle', 'Phone Remote')}</h3>
                          <p>
                            {t(
                              'remote.settingsDesc',
                              'Control playback from a phone on the same Wi-Fi.'
                            )}
                          </p>
                        </div>
                        <div
                          className="settings-chip-row no-drag"
                          style={{ justifyContent: 'flex-end' }}
                        >
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={() => setPhoneRemoteDrawerOpen(true)}
                          >
                            <Smartphone size={14} />
                            {t('remote.openDrawer', 'Open remote')}
                          </UiButton>
                          <button
                            type="button"
                            className={`toggle-btn ${config.phoneRemoteEnabled ? 'active' : ''}`}
                            disabled={phoneRemoteBusy}
                            onClick={() => {
                              if (config.phoneRemoteEnabled === true) {
                                void handlePhoneRemoteStop()
                                return
                              }
                              void handlePhoneRemoteStart()
                            }}
                            aria-pressed={config.phoneRemoteEnabled === true}
                          >
                            {config.phoneRemoteEnabled ? (
                              <ToggleRight size={32} />
                            ) : (
                              <ToggleLeft size={32} />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="setting-row" style={{ alignItems: 'flex-start' }}>
                        <div className="setting-info">
                          <h3>
                            {t('settings.listeningLogTitle', '\u542c\u6b4c\u8bb0\u5f55 / Last.fm')}
                          </h3>
                          <p>
                            {t(
                              'settings.lastfmIntegratedDesc',
                              '\u4f7f\u7528 Last.fm \u6388\u6743\u540e\u81ea\u52a8\u8bb0\u5f55\u542c\u6b4c\u5386\u53f2\uff08Scrobble\uff09\u3002'
                            )}
                          </p>
                        </div>
                      </div>

                      {config.lastfmSessionKey ? (
                        <>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.lastfmConnected', 'Connected')}</h3>
                              <p>@{config.lastfmUsername || 'unknown'}</p>
                            </div>
                            <button
                              className="ui-btn ui-btn--compact lastfm-disconnect-btn"
                              onClick={() => {
                                void window.api?.lastfm?.logout?.()
                                setConfig((prev) => ({
                                  ...prev,
                                  lastfmEnabled: false,
                                  lastfmSessionKey: null,
                                  lastfmUsername: null
                                }))
                              }}
                            >
                              {t('settings.lastfmLogout', 'Disconnect')}
                            </button>
                          </div>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.lastfmScrobbleTitle', 'Scrobble')}</h3>
                              <p>
                                {t('settings.lastfmScrobbleDesc', 'Send played tracks to Last.fm.')}
                              </p>
                            </div>
                            <button
                              className={`toggle-btn ${config.lastfmEnabled ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  lastfmEnabled: !prev.lastfmEnabled
                                }))
                              }
                            >
                              {config.lastfmEnabled ? (
                                <ToggleRight size={32} />
                              ) : (
                                <ToggleLeft size={32} />
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <LastFmLoginForm
                          onLogin={(sessionKey, username) => {
                            setConfig((prev) => ({
                              ...prev,
                              lastfmEnabled: true,
                              lastfmSessionKey: sessionKey,
                              lastfmUsername: username
                            }))
                            void window.api?.lastfm?.setSession?.(sessionKey, username)
                          }}
                        />
                      )}
                    </section>
                  </div>

                  <div
                    id="settings-sec-eq"
                    data-settings-section="eq"
                    style={{ display: settingsSectionVisibility.eq ? '' : 'none' }}
                  >
                    <section
                      className={`settings-section eq-section echo-clean-eq-section ${!config.useEQ ? 'eq-bypassed-section' : ''}`}
                    >
                      <div className="eq-clean-header">
                        <div className="eq-clean-heading">
                          <div className="eq-clean-icon">
                            <Sliders size={18} />
                          </div>
                          <div className="eq-clean-heading-copy">
                            <div className="eq-clean-title-row">
                              <h2>{t('settings.eqSection')}</h2>
                              <span
                                className={`eq-clean-status-pill ${config.useEQ ? 'active' : ''}`}
                              >
                                {config.useEQ ? t('eqPlot.enabled') : t('eqPlot.disabled')}
                              </span>
                            </div>
                            <p>
                              {useNativeEngine
                                ? t('settings.eqEngineHintHifi')
                                : t('settings.eqEngineHintStandard')}
                            </p>
                          </div>
                        </div>
                        <div className="eq-clean-toolbar">
                          <button
                            type="button"
                            className={`eq-status-toggle ${config.useEQ ? 'active' : ''}`}
                            aria-pressed={config.useEQ}
                            onClick={() => {
                              const nextUseEq = config.useEQ !== true
                              if (nextUseEq) setEqAdvancedOpen(true)
                              setConfig((prev) => ({ ...prev, useEQ: nextUseEq }))
                            }}
                          >
                            {config.useEQ ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            <span>{config.useEQ ? t('eqPlot.enabled') : t('eqPlot.disabled')}</span>
                          </button>
                          <label className="eq-toolbar-control">
                            {t('eqPlot.quality')}
                            <select
                              className="eq-toolbar-select"
                              value={config.eqOversampling || '2x'}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  eqOversampling: e.target.value
                                }))
                              }
                            >
                              <option value="4x">{t('eqPlot.oversampling.high')}</option>
                              <option value="2x">{t('eqPlot.oversampling.balanced')}</option>
                              <option value="off">{t('eqPlot.oversampling.lowCpu')}</option>
                            </select>
                          </label>
                          <label className="eq-toolbar-control">
                            {t('eqPlot.outputSafety')}
                            <select
                              className="eq-toolbar-select"
                              value={config.eqOutputSafety || 'soft'}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  eqOutputSafety: e.target.value
                                }))
                              }
                            >
                              <option value="soft">{t('eqPlot.outputSafetyModes.soft')}</option>
                              <option value="hard">{t('eqPlot.outputSafetyModes.hard')}</option>
                              <option value="off">{t('eqPlot.outputSafetyModes.off')}</option>
                            </select>
                          </label>
                          <button
                            className="eq-toolbar-btn"
                            onClick={() => {
                              const resetBands = config.eqBands.map((b) => ({
                                ...b,
                                gain: 0
                              }))
                              setEqSoloBandIdx(null)
                              setConfig((prev) => ({
                                ...prev,
                                eqBands: resetBands,
                                preamp: 0
                              }))
                            }}
                          >
                            <Repeat size={14} /> {t('settings.reset')}
                          </button>

                          <div className="custom-dropdown-container eq-preset-menu">
                            <button
                              type="button"
                              className="dropdown-trigger eq-preset-trigger"
                              onClick={() => setIsPresetOpen(!isPresetOpen)}
                            >
                              <span>
                                {t(`eqPreset.${config.activePreset || 'Custom'}`, {
                                  defaultValue: config.activePreset || 'Custom'
                                })}
                              </span>
                              <ChevronDown size={14} />
                            </button>
                            {isPresetOpen && (
                              <div className="dropdown-menu show">
                                {Object.keys(EQ_PRESETS).map((name) => (
                                  <div
                                    key={name}
                                    className="dropdown-item"
                                    onClick={() => {
                                      const preset = EQ_PRESETS[name]
                                      if (preset) {
                                        setEqSoloBandIdx(null)
                                        const newBands = config.eqBands?.map((b, i) => ({
                                          ...b,
                                          gain:
                                            preset.bands[i] !== undefined ? preset.bands[i] : b.gain
                                        }))
                                        setConfig((prev) => ({
                                          ...prev,
                                          eqBands: newBands,
                                          preamp: preset.preamp,
                                          activePreset: name
                                        }))
                                      } else {
                                        setConfig((prev) => ({
                                          ...prev,
                                          activePreset: 'Custom'
                                        }))
                                      }
                                      setIsPresetOpen(false)
                                    }}
                                  >
                                    {t(`eqPreset.${name}`, { defaultValue: name })}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <details
                        className="eq-advanced-details"
                        open={eqAdvancedOpen}
                        onToggle={(event) => setEqAdvancedOpen(event.currentTarget.open)}
                      >
                        <summary className="eq-advanced-summary">
                          <span>
                            {t('eqPlot.advancedEditor', { defaultValue: '高级参数编辑' })}
                          </span>
                          <small>
                            {t('eqPlot.advancedEditorHint', {
                              defaultValue: '展开后调整曲线、频段、Q 值与前级'
                            })}
                          </small>
                          <ChevronDown size={14} className="eq-advanced-chevron" />
                        </summary>

                        <EqPlot
                          accentHex={activeAccentHex}
                          bands={config.eqBands}
                          enabled={config.useEQ}
                          preamp={config.preamp || 0}
                          analyser={analyserNode.current}
                          soloIdx={eqSoloBandIdx}
                          onSoloChange={setEqSoloBandIdx}
                          onEnable={() => {
                            setEqAdvancedOpen(true)
                            setConfig((prev) => ({ ...prev, useEQ: true }))
                          }}
                          onPreampChange={(val) =>
                            setConfig((prev) => ({
                              ...prev,
                              preamp: val,
                              activePreset: 'Custom'
                            }))
                          }
                          onBandChange={(idx, updates) => {
                            const newBands = [...config.eqBands]
                            newBands[idx] = { ...newBands[idx], ...updates }
                            setConfig((prev) => ({
                              ...prev,
                              eqBands: newBands,
                              activePreset: 'Custom'
                            }))
                          }}
                        />
                      </details>
                    </section>
                  </div>

                  <div
                    id="settings-sec-aesthetics"
                    data-settings-section="aesthetics"
                    style={{ display: settingsSectionVisibility.aesthetics ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div
                        className="section-title"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          width: '100%',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Palette size={20} />
                          <h2>{t('settings.aesthetics')}</h2>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            alignItems: 'center',
                            justifyContent: 'flex-end'
                          }}
                        >
                          <UiButton
                            variant="secondary"
                            size="compact"
                            onClick={async () => {
                              const slice = pickThemeExportSlice(config)
                              const json = JSON.stringify(
                                {
                                  type: 'echoes-studio-theme',
                                  v: 1,
                                  payload: slice
                                },
                                null,
                                2
                              )
                              const r = await window.api.saveThemeJsonHandler(
                                json,
                                'echoes-studio-theme.json',
                                configRef.current.uiLocale
                              )
                              if (r && r.success === false && r.error) alert(r.error)
                            }}
                          >
                            <Download size={14} /> {t('settings.exportTheme')}
                          </UiButton>
                          <UiButton
                            variant="secondary"
                            size="compact"
                            onClick={async () => {
                              const r = await window.api.openThemeJsonHandler(
                                configRef.current.uiLocale
                              )
                              if (r?.error) {
                                alert(r.error)
                                return
                              }
                              if (r?.content) {
                                try {
                                  const bundle = parseThemeBundleJson(r.content)
                                  setConfig((prev) => mergeThemeImport(prev, bundle))
                                } catch (e) {
                                  alert(e.message || String(e))
                                }
                              }
                            }}
                          >
                            <Upload size={14} /> {t('settings.importTheme')}
                          </UiButton>
                          <UiButton
                            variant="primary"
                            size="compact"
                            onClick={() => {
                              const theme = normalizeThemeColors(generateRandomPalette())
                              setConfig((prev) => ({
                                ...prev,
                                theme: 'custom',
                                customColors: theme
                              }))
                            }}
                          >
                            <Wand2 size={16} /> {t('settings.randomize')}
                          </UiButton>
                        </div>
                      </div>

                      <div className="setting-row" style={{ marginBottom: 20 }}>
                        <div className="setting-info">
                          <h3>{t('settings.sidebarLogoTitle')}</h3>
                          <p>{t('settings.sidebarLogoDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.showSidebarLogo !== false ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              showSidebarLogo: !(prev.showSidebarLogo !== false)
                            }))
                          }
                        >
                          {config.showSidebarLogo !== false ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      <div className="setting-row" style={{ marginBottom: 20 }}>
                        <div className="setting-info">
                          <h3>{t('settings.ultraSmallScreenAdaptiveTitle')}</h3>
                          <p>{t('settings.ultraSmallScreenAdaptiveDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.ultraSmallScreenAdaptive === true ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              ultraSmallScreenAdaptive: !prev.ultraSmallScreenAdaptive
                            }))
                          }
                        >
                          {config.ultraSmallScreenAdaptive === true ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>

                      <div className="setting-row" style={{ marginBottom: 20 }}>
                        <div className="setting-info">
                          <h3>{t('settings.titlebarToolsTitle', 'Titlebar tool buttons')}</h3>
                          <p>
                            {t(
                              'settings.titlebarToolsDesc',
                              'Keep less-used tools hidden by default; turn them on here when you want quick access.'
                            )}
                          </p>
                        </div>
                        <div className="settings-chip-row no-drag" style={{ justifyContent: 'flex-end' }}>
                          {[
                            {
                              key: 'showTitlebarCastSender',
                              label: t('settings.titlebarCastSender', 'Cast sender')
                            },
                            {
                              key: 'showTitlebarListenTogether',
                              label: t('settings.titlebarListenTogether', 'Listen Together')
                            },
                            {
                              key: 'showTitlebarPlugins',
                              label: t('settings.titlebarPlugins', 'Plugins')
                            }
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className={`list-filter-chip ${config[item.key] === true ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  [item.key]: prev[item.key] !== true
                                }))
                              }
                              aria-pressed={config[item.key] === true}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        className="themes-grid"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '16px',
                          marginBottom: '24px'
                        }}
                      >
                        {Object.entries(PRESET_THEMES).map(([key, theme]) => {
                          const tc = normalizeThemeColors(theme.colors)
                          const previewBg =
                            tc.bgMode === 'linear'
                              ? `linear-gradient(${tc.bgGradientAngle}deg, ${tc.bgColor}, ${tc.bgGradientEnd})`
                              : tc.bgColor
                          return (
                            <div
                              key={key}
                              style={{
                                position: 'relative',
                                padding: '12px',
                                borderRadius: '16px',
                                border: `2px solid ${config.theme === key ? 'var(--accent-pink)' : 'transparent'}`,
                                background: 'var(--glass-bg)',
                                color: 'var(--text-main)',
                                textAlign: 'center',
                                boxShadow:
                                  config.theme === key
                                    ? `0 8px 24px ${hexToRgbaString(tc.accent1, 0.22)}`
                                    : '0 4px 12px rgba(0,0,0,0.05)',
                                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                gap: '8px',
                                overflow: 'hidden'
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.transform = 'translateY(-4px)')
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.transform = 'translateY(0)')
                              }
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setConfig({ ...config, theme: key })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setConfig({ ...config, theme: key })
                                  }
                                }}
                                style={{
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '12px'
                                }}
                              >
                                <div
                                  style={{
                                    width: '100%',
                                    height: '40px',
                                    borderRadius: '8px',
                                    background: previewBg,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: '13px',
                                    zIndex: 1,
                                    fontWeight: 700
                                  }}
                                >
                                  {t(`themePreset.${key}`, {
                                    defaultValue: theme.name
                                  })}
                                </span>
                                {config.theme === key && (
                                  <CheckCircle2
                                    size={18}
                                    color="var(--accent-pink)"
                                    style={{
                                      position: 'absolute',
                                      top: '8px',
                                      right: '8px',
                                      background: 'white',
                                      borderRadius: '50%',
                                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                                    }}
                                  />
                                )}
                              </div>
                              <button
                                type="button"
                                className="no-drag"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfig((prev) => ({
                                    ...prev,
                                    theme: 'custom',
                                    customColors: normalizeThemeColors({
                                      ...PRESET_THEMES[key].colors
                                    })
                                  }))
                                }}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  borderRadius: '10px',
                                  border: '1px solid var(--glass-border)',
                                  background: 'rgba(255,255,255,0.25)',
                                  color: 'var(--text-main)',
                                  cursor: 'pointer'
                                }}
                              >
                                {t('settings.customizeTheme')}
                              </button>
                            </div>
                          )
                        })}

                        <div
                          onClick={() =>
                            setConfig({
                              ...config,
                              theme: 'custom',
                              customColors: normalizeThemeColors(
                                config.customColors || PRESET_THEMES.minimal.colors
                              )
                            })
                          }
                          style={{
                            position: 'relative',
                            cursor: 'pointer',
                            padding: '16px',
                            borderRadius: '16px',
                            border: `2px solid ${config.theme === 'custom' ? 'var(--accent-pink)' : 'var(--glass-border)'}`,
                            background: 'var(--glass-bg)',
                            color: 'var(--text-main)',
                            fontWeight: '700',
                            textAlign: 'center',
                            boxShadow:
                              config.theme === 'custom'
                                ? `0 8px 24px ${hexToRgbaString(
                                    normalizeThemeColors(
                                      config.customColors || PRESET_THEMES.minimal.colors
                                    ).accent1,
                                    0.22
                                  )}`
                                : '0 4px 12px rgba(0,0,0,0.05)',
                            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '12px'
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.transform = 'translateY(-4px)')
                          }
                          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: '40px',
                              borderRadius: '8px',
                              background: customThemePreviewBg,
                              backgroundSize: 'cover',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Palette size={20} color="white" />
                          </div>
                          <span style={{ fontSize: '13px' }}>{t('settings.themeCustomBadge')}</span>
                          {config.theme === 'custom' && (
                            <CheckCircle2
                              size={18}
                              color="var(--accent-pink)"
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: 'white',
                                borderRadius: '50%',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                              }}
                            />
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          maxHeight: config.theme === 'custom' ? '1600px' : '0px',
                          opacity: config.theme === 'custom' ? 1 : 0,
                          overflow: 'hidden',
                          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        {config.theme === 'custom' && config.customColors && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                              gap: '12px',
                              background: 'rgba(255,255,255,0.4)',
                              padding: '24px',
                              borderRadius: '16px',
                              border: '1px solid var(--glass-border)',
                              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.02)'
                            }}
                          >
                            {customThemeColorFields.map((field) => (
                              <div
                                key={field.key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: 'var(--glass-bg)',
                                  padding: '12px 16px',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(255,255,255,0.3)',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.transform = 'scale(1.02)')
                                }
                                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px'
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: 'var(--text-main)'
                                    }}
                                  >
                                    {field.label}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--text-soft)',
                                      opacity: 0.8
                                    }}
                                  >
                                    {field.desc}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      opacity: 0.5,
                                      fontFamily: 'monospace',
                                      background: 'rgba(0,0,0,0.05)',
                                      padding: '2px 6px',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    {config.customColors[field.key].toUpperCase()}
                                  </span>
                                  <div
                                    style={{
                                      position: 'relative',
                                      width: '30px',
                                      height: '30px',
                                      borderRadius: '50%',
                                      overflow: 'hidden',
                                      border: '2px solid rgba(255,255,255,0.8)',
                                      boxShadow: `0 0 10px ${config.customColors[field.key]}60`,
                                      flexShrink: 0
                                    }}
                                  >
                                    <input
                                      type="color"
                                      value={config.customColors[field.key]}
                                      onChange={(e) => {
                                        setConfig((prev) => ({
                                          ...prev,
                                          customColors: {
                                            ...prev.customColors,
                                            [field.key]: e.target.value
                                          }
                                        }))
                                      }}
                                      style={{
                                        position: 'absolute',
                                        top: '-10px',
                                        left: '-10px',
                                        width: '50px',
                                        height: '50px',
                                        cursor: 'pointer',
                                        border: 'none',
                                        padding: 0
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div
                              style={{
                                gridColumn: '1 / -1',
                                marginTop: 4,
                                padding: 16,
                                borderRadius: 12,
                                background: 'rgba(255,255,255,0.35)',
                                border: '1px solid var(--glass-border)'
                              }}
                            >
                              <h4
                                style={{
                                  margin: '0 0 12px',
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: 'var(--text-main)'
                                }}
                              >
                                Background gradient
                              </h4>
                              <div
                                className="setting-row"
                                style={{ border: 'none', padding: 0, marginBottom: 16 }}
                              >
                                <div className="setting-info">
                                  <h4>{t('settings.gradientMode')}</h4>
                                  <p>{t('settings.gradientModeDesc')}</p>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() =>
                                      setConfig((prev) => ({
                                        ...prev,
                                        customColors: normalizeThemeColors({
                                          ...prev.customColors,
                                          bgMode: 'solid'
                                        })
                                      }))
                                    }
                                    style={{
                                      opacity:
                                        normalizeThemeColors(config.customColors).bgMode === 'solid'
                                          ? 1
                                          : 0.55
                                    }}
                                  >
                                    Solid
                                  </button>
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() =>
                                      setConfig((prev) => ({
                                        ...prev,
                                        customColors: normalizeThemeColors({
                                          ...prev.customColors,
                                          bgMode: 'linear'
                                        })
                                      }))
                                    }
                                    style={{
                                      opacity:
                                        normalizeThemeColors(config.customColors).bgMode ===
                                        'linear'
                                          ? 1
                                          : 0.55
                                    }}
                                  >
                                    Linear
                                  </button>
                                </div>
                              </div>
                              {normalizeThemeColors(config.customColors).bgMode === 'linear' && (
                                <>
                                  <div
                                    className="setting-row"
                                    style={{
                                      border: 'none',
                                      padding: 0,
                                      marginBottom: 12
                                    }}
                                  >
                                    <div className="setting-info">
                                      <h4>{t('settings.gradientEnd')}</h4>
                                      <p>{t('settings.gradientEndDesc')}</p>
                                    </div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 11,
                                          fontFamily: 'monospace',
                                          opacity: 0.75
                                        }}
                                      >
                                        {normalizeThemeColors(
                                          config.customColors
                                        ).bgGradientEnd.toUpperCase()}
                                      </span>
                                      <input
                                        type="color"
                                        value={
                                          normalizeThemeColors(config.customColors).bgGradientEnd
                                        }
                                        onChange={(e) =>
                                          setConfig((prev) => ({
                                            ...prev,
                                            customColors: normalizeThemeColors({
                                              ...prev.customColors,
                                              bgGradientEnd: e.target.value
                                            })
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div
                                    className="setting-row"
                                    style={{ border: 'none', padding: 0 }}
                                  >
                                    <div className="setting-info">
                                      <h4>{t('settings.gradientAngle')}</h4>
                                      <p>{t('settings.gradientAngleDesc')}</p>
                                    </div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        width: 240
                                      }}
                                    >
                                      <span style={{ fontSize: 11, opacity: 0.5 }}>0</span>
                                      <input
                                        type="range"
                                        min={0}
                                        max={360}
                                        value={
                                          normalizeThemeColors(config.customColors).bgGradientAngle
                                        }
                                        onChange={(e) =>
                                          setConfig((prev) => ({
                                            ...prev,
                                            customColors: normalizeThemeColors({
                                              ...prev.customColors,
                                              bgGradientAngle: parseInt(e.target.value, 10)
                                            })
                                          }))
                                        }
                                        className="slider-nc"
                                      />
                                      <span style={{ fontSize: 11, opacity: 0.5 }}>360</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Wallpaper Decor Section */}
                      <div
                        className="setting-subsection"
                        style={{
                          marginTop: 24,
                          padding: 24,
                          background: 'rgba(255,255,255,0.3)',
                          borderRadius: 16
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 20
                          }}
                        >
                          <Image size={18} />
                          <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                            {t('settings.customWallpaperDecor')}
                          </h3>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.coverSizeTitle', 'Cover size')}</h4>
                            <p>
                              {t('settings.coverSizeDesc', 'Adjust the main player cover size.')}
                            </p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              minWidth: '240px',
                              alignItems: 'stretch'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '12px',
                                fontSize: '12px',
                                opacity: 0.78
                              }}
                            >
                              <span>180px</span>
                              <strong>{Math.round(config.playerCoverSize ?? 360)}px</strong>
                              <span>360px</span>
                            </div>
                            <input
                              type="range"
                              min={180}
                              max={360}
                              step={4}
                              value={config.playerCoverSize ?? 360}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  playerCoverSize: parseInt(e.target.value, 10)
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.bgImage')}</h4>
                            <p>{t('settings.bgImageDesc')}</p>
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            {config.customBgPath && (
                              <button
                                className="btn"
                                onClick={() =>
                                  setConfig((prev) => ({ ...prev, customBgPath: null }))
                                }
                                style={{
                                  width: 'auto',
                                  height: '36px',
                                  padding: '0 14px',
                                  fontSize: 12,
                                  borderRadius: 18
                                }}
                              >
                                {t('settings.clear')}
                              </button>
                            )}
                            <button
                              className="btn"
                              onClick={async () => {
                                const path = await window.api.openImageHandler(
                                  configRef.current.uiLocale
                                )
                                if (path)
                                  setConfig((prev) => ({
                                    ...prev,
                                    customBgPath: path
                                  }))
                              }}
                              style={{
                                width: 'auto',
                                height: '36px',
                                padding: '0 16px',
                                fontSize: 12,
                                fontWeight: 800,
                                borderRadius: 18,
                                background: 'var(--text-main)',
                                color: 'white'
                              }}
                            >
                              {config.customBgPath
                                ? t('settings.changeImage')
                                : t('settings.selectImage')}
                            </button>
                          </div>
                        </div>

                        {(config.customBgPath || config.themeCoverAsBackground) && (
                          <div className="setting-row" style={{ border: 'none', padding: 0 }}>
                            <div className="setting-info">
                              <h4>{t('settings.wallpaperOpacity')}</h4>
                              <p>{t('settings.wallpaperOpacityDesc')}</p>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                width: 200
                              }}
                            >
                              <span style={{ fontSize: 11, opacity: 0.5 }}>0%</span>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={wallpaperOpacity}
                                onChange={(e) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    customBgOpacity: normalizeUnitOpacity(
                                      e.target.value,
                                      wallpaperOpacity
                                    )
                                  }))
                                }
                                className="slider-nc"
                              />
                              <span style={{ fontSize: 11, opacity: 0.5 }}>100%</span>
                            </div>
                          </div>
                        )}
                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: '16px 0 0 0', marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.panelTransparency')}</h4>
                            <p>{t('settings.panelTransparencyDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 200
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.clear')}
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={0.95}
                              step={0.05}
                              value={config.uiBgOpacity !== undefined ? config.uiBgOpacity : 0.6}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiBgOpacity: parseFloat(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.solid')}
                            </span>
                          </div>
                        </div>

                        <div className="setting-row" style={{ border: 'none', padding: 0 }}>
                          <div className="setting-info">
                            <h4>{t('settings.blurStrength')}</h4>
                            <p>{t('settings.blurStrengthDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 200
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.blurNone')}
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={80}
                              step={1}
                              value={config.uiBlur !== undefined ? config.uiBlur : 20}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiBlur: parseInt(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.blurHeavy')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className="setting-subsection"
                        style={{
                          marginTop: 16,
                          padding: 24,
                          background: 'rgba(255,255,255,0.3)',
                          borderRadius: 16
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            marginBottom: 20
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Sliders size={18} />
                            <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                              {t('settings.typographySection')}
                            </h3>
                          </div>
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={handleResetTypographyConfig}
                          >
                            {t(
                              'settings.resetTypographyParams',
                              '\u6062\u590d\u9ed8\u8ba4\u53c2\u6570'
                            )}
                          </UiButton>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.uiFont')}</h4>
                            <p>{t('settings.uiFontDesc')}</p>
                            <p
                              style={{
                                fontSize: 12,
                                opacity: 0.65,
                                marginTop: 6
                              }}
                            >
                              {t('settings.fontCustomHint')}
                            </p>
                          </div>
                          <div className="settings-font-custom-meta no-drag">
                            <div className="settings-chip-row">
                              {['outfit', 'inter', 'system'].map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  className={`list-filter-chip ${(config.uiFontFamily || 'outfit') === key ? 'active' : ''}`}
                                  onClick={() =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      uiFontFamily: key,
                                      uiCustomFontPath: null
                                    }))
                                  }
                                >
                                  {key === 'outfit'
                                    ? t('settings.fontOutfit')
                                    : key === 'inter'
                                      ? t('settings.fontInter')
                                      : t('settings.fontSystem')}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`list-filter-chip ${config.uiFontFamily === 'custom' ? 'active' : ''}`}
                                onClick={() => {
                                  if (config.uiFontFamily === 'custom' && config.uiCustomFontPath) {
                                    return
                                  }
                                  setConfig((prev) => ({
                                    ...prev,
                                    uiFontFamily: 'custom'
                                  }))
                                  void pickUiCustomFont()
                                }}
                              >
                                {t('settings.fontCustom')}
                              </button>
                            </div>
                            {config.uiFontFamily === 'custom' && config.uiCustomFontPath && (
                              <span
                                className="settings-font-file-name"
                                title={config.uiCustomFontPath}
                              >
                                {t('settings.fontCustomActive', {
                                  name:
                                    config.uiCustomFontPath.split(/[/\\]/).pop() ||
                                    config.uiCustomFontPath
                                })}
                              </span>
                            )}
                            {(config.uiFontFamily === 'custom' || config.uiCustomFontPath) && (
                              <div className="settings-chip-row" style={{ marginTop: 4 }}>
                                <button
                                  type="button"
                                  className="list-filter-chip"
                                  onClick={() => void pickUiCustomFont()}
                                >
                                  {t('settings.fontAddFile')}
                                </button>
                                {config.uiCustomFontPath ? (
                                  <button
                                    type="button"
                                    className="list-filter-chip"
                                    onClick={() =>
                                      setConfig((prev) => ({
                                        ...prev,
                                        uiFontFamily: 'outfit',
                                        uiCustomFontPath: null
                                      }))
                                    }
                                  >
                                    {t('settings.fontClearCustom')}
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.cjkFont')}</h4>
                            <p>{t('settings.cjkFontDesc')}</p>
                          </div>
                          <div className="settings-font-custom-meta no-drag">
                            <div className="settings-chip-row settings-chip-row--cjk-font">
                              {CJK_FONT_OPTIONS.map((option) => (
                                <button
                                  key={option.key}
                                  type="button"
                                  className={`list-filter-chip ${(config.uiCjkFontFamily || 'auto') === option.key ? 'active' : ''}`}
                                  onClick={() => {
                                    if (option.key === 'custom') {
                                      if (
                                        config.uiCjkFontFamily === 'custom' ||
                                        !config.uiCjkCustomFontPath
                                      ) {
                                        void pickUiCjkCustomFont()
                                        return
                                      }
                                      setConfig((prev) => ({
                                        ...prev,
                                        uiCjkFontFamily: 'custom'
                                      }))
                                      return
                                    }
                                    setConfig((prev) => ({
                                      ...prev,
                                      uiCjkFontFamily: option.key,
                                      uiCjkCustomFontPath: null
                                    }))
                                  }}
                                >
                                  {t(`settings.${option.labelKey}`)}
                                </button>
                              ))}
                            </div>
                            {config.uiCjkFontFamily === 'custom' && config.uiCjkCustomFontPath && (
                              <span
                                className="settings-font-file-name"
                                title={config.uiCjkCustomFontPath}
                              >
                                {t('settings.fontCustomActive', {
                                  name:
                                    config.uiCjkCustomFontPath.split(/[/\\]/).pop() ||
                                    config.uiCjkCustomFontPath
                                })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.baseFontSize')}</h4>
                            <p>{t('settings.baseFontSizeDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 220
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>12</span>
                            <input
                              type="range"
                              min={12}
                              max={20}
                              step={1}
                              value={config.uiBaseFontSize ?? 15}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiBaseFontSize: parseInt(e.target.value, 10)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>20</span>
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.radiusScale')}</h4>
                            <p>{t('settings.radiusScaleDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 220
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.radiusTight')}
                            </span>
                            <input
                              type="range"
                              min={0.85}
                              max={1.15}
                              step={0.05}
                              value={config.uiRadiusScale ?? 1}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiRadiusScale: parseFloat(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.radiusSoft')}
                            </span>
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.shadowStrength')}</h4>
                            <p>{t('settings.shadowStrengthDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 220
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.shadowFlat')}
                            </span>
                            <input
                              type="range"
                              min={0.5}
                              max={1.5}
                              step={0.05}
                              value={config.uiShadowIntensity ?? 1}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiShadowIntensity: parseFloat(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.shadowDeep')}
                            </span>
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.saturation')}</h4>
                            <p>{t('settings.saturationDesc')}</p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 220
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>0.8</span>
                            <input
                              type="range"
                              min={0.8}
                              max={1.2}
                              step={0.02}
                              value={config.uiSaturation ?? 1}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiSaturation: parseFloat(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>1.2</span>
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.lineHeightScale', 'Interface line spacing')}</h4>
                            <p>
                              {t(
                                'settings.lineHeightScaleDesc',
                                'Adjust text rhythm across settings, lists, and panels.'
                              )}
                            </p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 220
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.lineHeightCompact', 'Compact')}
                            </span>
                            <input
                              type="range"
                              min={0.9}
                              max={1.25}
                              step={0.05}
                              value={config.uiLineHeightScale ?? 1}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiLineHeightScale: parseFloat(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.lineHeightLoose', 'Loose')}
                            </span>
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: 0, marginBottom: 20 }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.controlDensity', 'Control density')}</h4>
                            <p>
                              {t(
                                'settings.controlDensityDesc',
                                'Tune spacing for rows, chips, and compact controls.'
                              )}
                            </p>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              width: 220
                            }}
                          >
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.densityCompact', 'Tight')}
                            </span>
                            <input
                              type="range"
                              min={0.85}
                              max={1.15}
                              step={0.05}
                              value={config.uiControlDensity ?? 1}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  uiControlDensity: parseFloat(e.target.value)
                                }))
                              }
                              className="slider-nc"
                            />
                            <span style={{ fontSize: 11, opacity: 0.5 }}>
                              {t('settings.densityRoomy', 'Roomy')}
                            </span>
                          </div>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: '16px 0 0 0' }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.themeDynamicCoverColor', 'Dynamic cover colors')}</h4>
                            <p>
                              {t(
                                'settings.themeDynamicCoverColorDesc',
                                'Use the current track cover as the theme color source.'
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`toggle-btn ${config.themeDynamicCoverColor ? 'active' : ''}`}
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                themeDynamicCoverColor: !prev.themeDynamicCoverColor
                              }))
                            }
                          >
                            {config.themeDynamicCoverColor ? (
                              <ToggleRight size={32} />
                            ) : (
                              <ToggleLeft size={32} />
                            )}
                          </button>
                        </div>

                        <div
                          className="setting-row"
                          style={{ border: 'none', padding: '16px 0 0 0' }}
                        >
                          <div className="setting-info">
                            <h4>{t('settings.themeCoverAsBackground', 'Cover background')}</h4>
                            <p>
                              {t(
                                'settings.themeCoverAsBackgroundDesc',
                                'Use the current playing cover as the background image.'
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`toggle-btn ${config.themeCoverAsBackground ? 'active' : ''}`}
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                themeCoverAsBackground: !prev.themeCoverAsBackground
                              }))
                            }
                          >
                            {config.themeCoverAsBackground ? (
                              <ToggleRight size={32} />
                            ) : (
                              <ToggleLeft size={32} />
                            )}
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div
                    id="settings-sec-downloader"
                    data-settings-section="downloader"
                    style={{ display: settingsSectionVisibility.media ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title">
                        <Download size={20} />
                        <h2>
                          {t(
                            'settings.libraryAndDownloads',
                            '\u5a92\u4f53\u5e93\u4e0e\u4e0b\u8f7d'
                          )}
                        </h2>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.downloadDirTitle')}</h3>
                          <p>{t('settings.downloadDirDesc')}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--text-soft)',
                              maxWidth: 180,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {config.downloadFolder || t('settings.notSet')}
                          </span>
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const folders = await window.api.openDirectoryHandler()
                              if (folders && folders.length > 0) {
                                setConfig((prev) => ({
                                  ...prev,
                                  downloadFolder: folders[0]
                                }))
                              }
                            }}
                          >
                            {t('settings.setFolder')}
                          </UiButton>
                        </div>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.autoSaveLibraryTitle')}</h3>
                          <p>{t('settings.autoSaveLibraryDesc')}</p>
                        </div>
                        <button
                          className={`toggle-btn ${config.autoSaveLibrary !== false ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              autoSaveLibrary: !(prev.autoSaveLibrary !== false)
                            }))
                          }
                        >
                          {config.autoSaveLibrary !== false ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.plImportTitle')}</h3>
                          <p>{t('settings.plImportDesc')}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--text-soft)',
                              maxWidth: 180,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                            title={config.playlistImportFolder || config.downloadFolder || ''}
                          >
                            {config.playlistImportFolder
                              ? config.playlistImportFolder
                              : config.downloadFolder
                                ? t('settings.sameAsDownload')
                                : t('settings.notSet')}
                          </span>
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const folders = await window.api.openDirectoryHandler()
                              if (folders && folders.length > 0) {
                                setConfig((prev) => ({
                                  ...prev,
                                  playlistImportFolder: folders[0]
                                }))
                              }
                            }}
                          >
                            {t('settings.chooseFolder')}
                          </UiButton>
                          {config.playlistImportFolder ? (
                            <UiButton
                              variant="ghost"
                              size="sm"
                              style={{ opacity: 0.85 }}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  playlistImportFolder: null
                                }))
                              }
                            >
                              {t('settings.useDownloadFolder')}
                            </UiButton>
                          ) : null}
                        </div>
                      </div>
                      <div className="setting-row">
                        <div className="setting-info">
                          <h3>{t('settings.libraryCleanupTitle', 'Library cleanup')}</h3>
                          <p>
                            {missingLibraryPaths.length > 0
                              ? t(
                                  'settings.libraryCleanupFound',
                                  `${missingLibraryPaths.length} invalid path(s) found in your library references.`
                                )
                              : t(
                                  'settings.libraryCleanupDesc',
                                  'Remove missing files and stale folder references from the library.'
                                )}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <UiButton
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              void scanMissingLibraryPaths()
                            }}
                            disabled={libraryCleanupBusy}
                          >
                            {libraryCleanupBusy
                              ? t('settings.libraryCleanupScanning', 'Scanning...')
                              : t('settings.libraryCleanupScan', 'Scan library')}
                          </UiButton>
                          <UiButton
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void cleanupMissingLibraryPaths()
                            }}
                            disabled={libraryCleanupBusy || missingLibraryPaths.length === 0}
                            style={{
                              opacity:
                                libraryCleanupBusy || missingLibraryPaths.length === 0 ? 0.55 : 1
                            }}
                          >
                            {t('settings.libraryCleanupRemove', 'Remove missing')}
                          </UiButton>
                        </div>
                      </div>
                      {missingLibraryPaths.length > 0 ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 12,
                            borderRadius: 12,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-secondary)',
                            display: 'grid',
                            gap: 6
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {t('settings.libraryCleanupPreview', 'Preview of invalid paths')}
                          </div>
                          {missingLibraryPaths.slice(0, 5).map((path) => (
                            <div
                              key={path}
                              style={{
                                fontSize: 12,
                                color: 'var(--text-soft)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={path}
                            >
                              {path}
                            </div>
                          ))}
                          {missingLibraryPaths.length > 5 ? (
                            <div style={{ fontSize: 12, opacity: 0.55 }}>
                              {t(
                                'settings.libraryCleanupMore',
                                `and ${missingLibraryPaths.length - 5} more...`
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  </div>

                  <div
                    id="settings-sec-remote-library"
                    data-settings-section="remoteLibrary"
                    style={{ display: settingsSectionVisibility.remoteLibrary ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title">
                        <Globe size={20} />
                        <h2>网盘 / 远程音乐库</h2>
                      </div>
                      <RemoteLibrarySettings
                        sources={remoteLibrarySources}
                        encryptionAvailable={remoteLibraryEncryptionAvailable}
                        onReload={reloadRemoteLibrarySources}
                        onSelectSource={setActiveRemoteLibrarySourceId}
                      />
                    </section>
                  </div>

                  <div
                    id="settings-sec-about"
                    data-settings-section="about"
                    style={{ display: settingsSectionVisibility.about ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title">
                        <Info size={20} />
                        <h2>
                          {t('settings.aboutAdvancedTitle', '\u5173\u4e8e\u4e0e\u9ad8\u7ea7')}
                        </h2>
                      </div>
                      <p style={{ opacity: 0.6, fontSize: '14px', lineHeight: 1.6 }}>
                        {t('settings.aboutBody')}
                      </p>
                      <p style={{ opacity: 0.72, fontSize: '13px', lineHeight: 1.6, marginTop: 8 }}>
                        {t(
                          'settings.openSourceTrustNote',
                          'ECHO does not save any account information, contains no dangerous code, and the whole project is fully open source.'
                        )}
                      </p>
                      <div className="setting-row" style={{ marginTop: 12 }}>
                        <div className="setting-info">
                          <h3>{t('settings.autoUpdateTitle')}</h3>
                          <p>{t('settings.autoUpdateDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.autoUpdateEnabled !== false ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              autoUpdateEnabled: !(prev.autoUpdateEnabled !== false)
                            }))
                          }
                          aria-pressed={config.autoUpdateEnabled !== false}
                        >
                          {config.autoUpdateEnabled !== false ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>
                      <div
                        className="settings-version-text"
                        style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                      >
                        {t('settings.versionText', { version: appVersion || '1.1.2' })}
                        <button
                          className="control-btn"
                          disabled={isUpdating || config.networkAccessDisabled === true}
                          onClick={() => {
                            if (config.networkAccessDisabled === true) {
                              alert(
                                t('settings.networkDisabledStatus', 'Network access is disabled.')
                              )
                              return
                            }
                            setIsUpdating(true)
                            setUpdateStatus({ event: 'checking' })
                            window.api?.checkForUpdates?.()
                          }}
                          style={{
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            cursor:
                              isUpdating || config.networkAccessDisabled === true
                                ? 'not-allowed'
                                : 'pointer'
                          }}
                        >
                          {isUpdating
                            ? t('settings.checkingForUpdates', 'Checking...')
                            : t('settings.checkUpdates', 'Check for Updates')}
                        </button>
                      </div>
                      {updateStatus && updateStatus.event !== 'checking' && (
                        <div style={{ marginTop: '6px' }}>
                          {updateStatus.event === 'download-progress' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>
                                {t('settings.downloading', 'Downloading update...')}{' '}
                                {updateStatus.percent ?? 0}%
                              </p>
                              <div
                                style={{
                                  width: '260px',
                                  height: '4px',
                                  borderRadius: '2px',
                                  background: 'var(--color-border)',
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${updateStatus.percent ?? 0}%`,
                                    background: 'var(--color-accent, #3b82f6)',
                                    borderRadius: '2px',
                                    transition: 'width 0.3s ease'
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          {updateStatus.event !== 'download-progress' && (
                            <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>
                              {updateStatus.event === 'update-available'
                                ? t('settings.updateAvailable', 'Update available, downloading...')
                                : updateStatus.event === 'update-not-available'
                                  ? t(
                                      'settings.updateNotAvailable',
                                      'You are on the latest version.'
                                    )
                                  : updateStatus.event === 'update-downloaded'
                                    ? t('settings.updateDownloaded', {
                                        version: updateStatus.version,
                                        defaultValue: `v${updateStatus.version} downloaded, will install on exit.`
                                      })
                                    : updateStatus.event === 'error'
                                      ? t('settings.updateError', 'Error checking for updates.')
                                      : ''}
                            </p>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 12 }}>
                        <button
                          className="control-btn"
                          onClick={() => {
                            const nextOpen = !releaseNotesOpen
                            setReleaseNotesOpen(nextOpen)
                            if (nextOpen) {
                              void loadReleaseNotes()
                            }
                          }}
                          style={{
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            cursor: 'pointer'
                          }}
                        >
                          {t('settings.viewChangelog', 'View changelog')}
                        </button>
                        <button
                          className="control-btn"
                          disabled={releaseNotesLoading}
                          onClick={() => {
                            setReleaseNotesOpen(true)
                            void loadReleaseNotes(true)
                          }}
                          style={{
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            cursor: releaseNotesLoading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {t('settings.refreshChangelog', 'Refresh changelog')}
                        </button>
                        <button
                          className="control-btn"
                          onClick={() => openExternalLink(GITHUB_RELEASES_PAGE_URL)}
                          style={{
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            cursor: 'pointer'
                          }}
                        >
                          {t('settings.openReleasesPage', 'Open releases page')}
                        </button>
                        <button
                          className="control-btn"
                          onClick={() =>
                            openExternalLink('https://github.com/Moekotori/ECHO/tree/moe/carnary')
                          }
                          style={{
                            padding: '4px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            cursor: 'pointer'
                          }}
                        >
                          {t('settings.openCanaryBranch', 'Canary')}
                        </button>
                      </div>
                      {releaseNotesOpen ? (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 14,
                            borderRadius: 12,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-secondary)'
                          }}
                        >
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                              {preferredReleaseVersion
                                ? t('settings.releaseNotesForVersion', {
                                    version: `v${preferredReleaseVersion}`
                                  })
                                : t('settings.releaseNotesLatest', 'Latest release notes')}
                            </div>
                            <div style={{ opacity: 0.7, fontSize: '12px' }}>
                              {t(
                                'settings.releaseNotesHint',
                                'Recent fixes and changes are pulled from GitHub Releases.'
                              )}
                            </div>
                          </div>
                          {releaseNotesLoading ? (
                            <p style={{ margin: 0, opacity: 0.8 }}>
                              {t('settings.releaseNotesLoading', 'Loading changelog...')}
                            </p>
                          ) : releaseNotesError ? (
                            <p style={{ margin: 0, opacity: 0.8 }}>
                              {t(
                                'settings.releaseNotesUnavailable',
                                'Release notes are temporarily unavailable.'
                              )}{' '}
                              ({releaseNotesError})
                            </p>
                          ) : visibleReleaseNotes.length === 0 ? (
                            <p style={{ margin: 0, opacity: 0.8 }}>
                              {t(
                                'settings.releaseNotesUnavailable',
                                'Release notes are temporarily unavailable.'
                              )}
                            </p>
                          ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                              {visibleReleaseNotes.map((release) => {
                                const isPreferred =
                                  preferredReleaseVersion &&
                                  normalizeReleaseVersion(release.version) ===
                                    preferredReleaseVersion
                                return (
                                  <div
                                    key={`${release.version}-${release.url}`}
                                    style={{
                                      padding: 12,
                                      borderRadius: 10,
                                      border: `1px solid ${isPreferred ? 'var(--color-accent, #3b82f6)' : 'var(--color-border)'}`,
                                      background: 'var(--color-bg-primary)'
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                        gap: 12
                                      }}
                                    >
                                      <div>
                                        <div style={{ fontWeight: 600 }}>
                                          {release.title || `v${release.version || '?'}`}
                                        </div>
                                        <div
                                          style={{ opacity: 0.7, fontSize: '12px', marginTop: 2 }}
                                        >
                                          {release.publishedLabel || `v${release.version || '?'}`}
                                        </div>
                                      </div>
                                      <button
                                        className="control-btn"
                                        onClick={() => openExternalLink(release.url)}
                                        style={{
                                          padding: '4px 10px',
                                          fontSize: '12px',
                                          borderRadius: '4px',
                                          background: 'var(--color-bg-secondary)',
                                          border: '1px solid var(--color-border)',
                                          cursor: 'pointer',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {t('settings.openFullRelease', 'Open release')}
                                      </button>
                                    </div>
                                    {Array.isArray(release.previewLines) &&
                                    release.previewLines.length > 0 ? (
                                      <ul
                                        style={{
                                          margin: '10px 0 0 18px',
                                          padding: 0,
                                          lineHeight: 1.5
                                        }}
                                      >
                                        {release.previewLines.slice(0, 4).map((line, index) => (
                                          <li key={`${release.version}-preview-${index}`}>
                                            {line}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                      <p className="settings-version-text">{t('settings.poweredBy')}</p>
                      <div className="setting-row" style={{ marginTop: 8 }}>
                        <div className="setting-info">
                          <h3>{t('settings.devModeTitle')}</h3>
                          <p>{t('settings.devModeDesc')}</p>
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.devModeEnabled ? 'active' : ''}`}
                          onClick={() =>
                            setConfig((prev) => {
                              const nextDevModeEnabled = !prev.devModeEnabled
                              return {
                                ...prev,
                                devModeEnabled: nextDevModeEnabled,
                                devOpenDevToolsOnStartup: nextDevModeEnabled
                                  ? prev.devOpenDevToolsOnStartup
                                  : false
                              }
                            })
                          }
                          aria-pressed={!!config.devModeEnabled}
                        >
                          {config.devModeEnabled ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>
                      {config.devModeEnabled ? (
                        <>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.devStartupTitle')}</h3>
                              <p>{t('settings.devStartupDesc')}</p>
                            </div>
                            <button
                              type="button"
                              className={`toggle-btn ${config.devOpenDevToolsOnStartup ? 'active' : ''}`}
                              onClick={() =>
                                setConfig((prev) => ({
                                  ...prev,
                                  devOpenDevToolsOnStartup: !prev.devOpenDevToolsOnStartup
                                }))
                              }
                              aria-pressed={!!config.devOpenDevToolsOnStartup}
                            >
                              {config.devOpenDevToolsOnStartup ? (
                                <ToggleRight size={32} />
                              ) : (
                                <ToggleLeft size={32} />
                              )}
                            </button>
                          </div>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.devConsoleTitle')}</h3>
                              <p>{t('settings.devConsoleDesc')}</p>
                            </div>
                            <UiButton
                              variant="secondary"
                              onClick={async () => {
                                try {
                                  if (!window.api?.dev?.openDevTools) {
                                    alert(t('settings.devUnavailable'))
                                    return
                                  }
                                  const res = await window.api.dev.openDevTools()
                                  if (!res?.ok) {
                                    alert(
                                      t('settings.devOpenFailed', {
                                        message: res?.error || 'unknown'
                                      })
                                    )
                                  }
                                } catch (e) {
                                  alert(e?.message || String(e))
                                }
                              }}
                            >
                              {t('settings.devOpenConsole')}
                            </UiButton>
                          </div>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.devReloadTitle')}</h3>
                              <p>{t('settings.devReloadDesc')}</p>
                            </div>
                            <UiButton
                              variant="secondary"
                              onClick={async () => {
                                try {
                                  if (!window.api?.dev?.reloadWindow) {
                                    alert(t('settings.devUnavailable'))
                                    return
                                  }
                                  const res = await window.api.dev.reloadWindow()
                                  if (!res?.ok) {
                                    alert(
                                      t('settings.devReloadFailed', {
                                        message: res?.error || 'unknown'
                                      })
                                    )
                                  }
                                } catch (e) {
                                  alert(e?.message || String(e))
                                }
                              }}
                            >
                              {t('settings.devReloadButton')}
                            </UiButton>
                          </div>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.devCrashDirTitle')}</h3>
                              <p>{t('settings.devCrashDirDesc')}</p>
                            </div>
                            <UiButton
                              variant="secondary"
                              onClick={() => window.api?.openCrashDir?.()}
                            >
                              {t('settings.devOpenFolder')}
                            </UiButton>
                          </div>
                          <div className="setting-row">
                            <div className="setting-info">
                              <h3>{t('settings.devUserDataTitle')}</h3>
                              <p>{t('settings.devUserDataDesc')}</p>
                            </div>
                            <UiButton
                              variant="secondary"
                              onClick={async () => {
                                try {
                                  if (!window.api?.dev?.openUserData) {
                                    alert(t('settings.devUnavailable'))
                                    return
                                  }
                                  const res = await window.api.dev.openUserData()
                                  if (!res?.ok) {
                                    alert(
                                      t('settings.devUserDataFailed', {
                                        message: res?.error || 'unknown'
                                      })
                                    )
                                  }
                                } catch (e) {
                                  alert(e?.message || String(e))
                                }
                              }}
                            >
                              {t('settings.devOpenFolder')}
                            </UiButton>
                          </div>
                        </>
                      ) : null}
                    </section>

                    <PluginSlot name="settingsPanel" />
                  </div>

                  <div
                    id="settings-sec-danger"
                    data-settings-section="danger"
                    style={{ display: settingsSectionVisibility.danger ? '' : 'none' }}
                  >
                    <section className="settings-section">
                      <div className="section-title" style={{ color: '#ff4d4f' }}>
                        <Trash2 size={20} aria-hidden />
                        <h2>
                          {t(
                            'settings.resetDangerTitle',
                            '\u91cd\u7f6e\u4e0e\u5371\u9669\u64cd\u4f5c'
                          )}
                        </h2>
                      </div>
                      <div className="setting-row" style={{ border: 'none', padding: '16px 0' }}>
                        <div className="setting-info">
                          <h3 style={{ color: '#ff4d4f' }}>
                            {t('settings.networkDisableTitle', 'Disable all network access')}
                          </h3>
                          <p>
                            {t(
                              'settings.networkDisableDesc',
                              'When enabled, ECHO will not connect to the network for updates, lyrics, covers, downloads, sign-in, or external pages.'
                            )}
                          </p>
                          {config.networkAccessDisabled === true ? (
                            <p style={{ marginTop: 6, fontSize: 12, color: '#ff4d4f' }}>
                              {t('settings.networkDisabledStatus', 'Network access is disabled.')}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`toggle-btn ${config.networkAccessDisabled === true ? 'active' : ''}`}
                          onClick={() => {
                            const nextDisabled = config.networkAccessDisabled !== true
                            if (
                              nextDisabled &&
                              !confirm(
                                t(
                                  'settings.networkDisableConfirm',
                                  'Disable all network access? Online lyrics, covers, downloads, updates, sign-in, and external links will stop working until you turn this off.'
                                )
                              )
                            ) {
                              return
                            }
                            setConfig((prev) => ({
                              ...prev,
                              networkAccessDisabled: nextDisabled,
                              autoUpdateEnabled: nextDisabled ? false : prev.autoUpdateEnabled
                            }))
                          }}
                          aria-pressed={config.networkAccessDisabled === true}
                        >
                          {config.networkAccessDisabled === true ? (
                            <ToggleRight size={32} />
                          ) : (
                            <ToggleLeft size={32} />
                          )}
                        </button>
                      </div>
                      <div className="setting-row" style={{ border: 'none', padding: '16px 0' }}>
                        <div className="setting-info">
                          <h3 style={{ color: '#ff4d4f' }}>{t('settings.resetThemeTitle')}</h3>
                          <p>{t('settings.resetThemeDesc')}</p>
                        </div>
                        <UiButton variant="danger" onClick={handleResetThemeConfig}>
                          {t('settings.resetThemeButton')}
                        </UiButton>
                      </div>
                      <div className="setting-row" style={{ border: 'none', padding: '16px 0' }}>
                        <div className="setting-info">
                          <h3 style={{ color: '#ff4d4f' }}>{t('settings.resetAllTitle')}</h3>
                          <p>{t('settings.resetAllDesc')}</p>
                        </div>
                        <UiButton variant="danger" onClick={handleResetAllConfig}>
                          {t('settings.resetAllButton')}
                        </UiButton>
                      </div>
                    </section>
                  </div>
                </div>
                {settingsScrollMetrics.visible ? (
                  <div
                    className="settings-scrollbar"
                    aria-hidden
                    onPointerDown={handleSettingsScrollbarPointerDown}
                    onPointerMove={handleSettingsScrollbarPointerMove}
                    onPointerUp={handleSettingsScrollbarPointerUp}
                    onPointerCancel={handleSettingsScrollbarPointerUp}
                  >
                    <div
                      className="settings-scrollbar-thumb"
                      style={{
                        height: settingsScrollMetrics.thumbHeight,
                        transform: `translateY(${settingsScrollMetrics.thumbTop}px)`
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <LyricsCandidatePicker
          open={lyricsCandidateOpen}
          loading={lyricsCandidateLoading}
          items={lyricsCandidateItems}
          onClose={() => setLyricsCandidateOpen(false)}
          onPick={handleLyricsCandidatePick}
          onSearch={searchLyricsCandidates}
        />
        <LyricsSettingsDrawer
          open={lyricsDrawerOpen}
          onClose={() => setLyricsDrawerOpen(false)}
          config={config}
          setConfig={setConfig}
          selectedLyricsSource={selectedLyricsSource}
          onLyricsSourceChange={handleLyricsSourceChange}
          lyricsMatchStatus={lyricsMatchStatus}
          lyricTimelineValid={lyricTimelineValid}
          lyricsSourceUi={lyricsSourceUi}
          isCurrentTrackInstrumental={isCurrentTrackLyricsInstrumental}
          instrumentalMarkAvailable={!!currentTrackPath}
          onInstrumentalToggle={handleLyricsInstrumentalToggle}
          onRefreshLyrics={retryFetchLyrics}
          onOpenManualSearch={openLyricsCandidatePicker}
          onFetchLyricsFromLink={fetchLyricsFromSourceLink}
          onApplyLyricsText={applyLyricsFromText}
          onNativeLyricsFilePick={pickLyricsFileNative}
        />
        <MediaDownloaderDrawer
          open={downloaderDrawerOpen}
          onClose={() => setDownloaderDrawerOpen(false)}
          config={config}
          setConfig={setConfig}
          albumContext={
            selectedAlbum !== 'all'
              ? {
                  name: selectedAlbum,
                  artist: albumBuckets.find((a) => a.name === selectedAlbum)?.artist || '',
                  existingTracks: albumBuckets.find((a) => a.name === selectedAlbum)?.tracks || []
                }
              : null
          }
          downloadFolder={config?.downloadPath || config?.downloadFolder || ''}
          userPlaylists={userPlaylists}
          setUserPlaylists={setUserPlaylists}
          setPlaylist={setPlaylist}
          setSelectedUserPlaylistId={setSelectedUserPlaylistId}
          onSuccess={(payload) => {
            const filePath = typeof payload === 'string' ? payload : payload?.path
            if (!filePath) return
            const sourceUrl =
              typeof payload === 'object' &&
              payload &&
              typeof payload.sourceUrl === 'string' &&
              payload.sourceUrl.trim()
                ? payload.sourceUrl.trim()
                : undefined
            const mvOriginUrl =
              typeof payload === 'object' &&
              payload &&
              typeof payload.mvOriginUrl === 'string' &&
              payload.mvOriginUrl.trim()
                ? payload.mvOriginUrl.trim()
                : undefined
            const title =
              typeof payload === 'object' && payload && typeof payload.title === 'string'
                ? payload.title.trim()
                : ''
            const artist =
              typeof payload === 'object' && payload && typeof payload.artist === 'string'
                ? payload.artist.trim()
                : ''
            const album =
              typeof payload === 'object' && payload && typeof payload.album === 'string'
                ? payload.album.trim()
                : ''
            const cover =
              typeof payload === 'object' && payload && typeof payload.cover === 'string'
                ? payload.cover.trim()
                : ''
            const fileName = filePath.split(/[/\\]/).pop()
            const newTrack = {
              name: fileName,
              path: filePath,
              type: 'local',
              ...(title || artist || album || cover
                ? {
                    info: {
                      ...(title ? { title } : {}),
                      ...(artist ? { artist, artists: artist } : {}),
                      ...(album ? { album } : {}),
                      ...(cover ? { cover } : {})
                    }
                  }
                : {}),
              ...(title ? { title } : {}),
              ...(artist ? { artist, artists: artist } : {}),
              ...(album ? { album } : {}),
              ...(cover ? { cover } : {}),
              ...(payload?.downloadProvider ? { downloadProvider: payload.downloadProvider } : {}),
              ...(payload?.hasLyrics ? { hasLyrics: true } : {}),
              ...(sourceUrl ? { sourceUrl } : {}),
              ...(mvOriginUrl ? { mvOriginUrl } : {})
            }
            setPlaylist((prev) => {
              const exists = prev.find((p) => p.path === filePath)
              return exists ? prev : [...prev, newTrack]
            })
          }}
        />
        <ListenTogetherDrawer
          open={listenTogetherDrawerOpen}
          onClose={() => setListenTogetherDrawerOpen(false)}
          t={t}
          currentTrack={currentTrack}
          nextTrack={nextTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={displayProgressDuration}
          syncContent={listenTogetherSyncContent}
          onRemotePlayState={handleListenTogetherRemoteState}
          onHostUploadStart={handleHostUploadStart}
          onHostPlayAfterBuffer={handleHostPlayAfterBuffer}
          onHostUploadEnd={handleHostUploadEnd}
        />
        <PhoneRemoteDrawer
          open={phoneRemoteDrawerOpen}
          onClose={() => setPhoneRemoteDrawerOpen(false)}
          t={t}
          config={config}
          status={phoneRemoteStatus}
          busy={phoneRemoteBusy}
          onStart={handlePhoneRemoteStart}
          onStop={handlePhoneRemoteStop}
          onRefresh={refreshPhoneRemoteStatus}
          onRotateToken={handlePhoneRemoteRotateToken}
          onKickClient={handlePhoneRemoteKickClient}
          onConfigChange={updatePhoneRemoteConfig}
        />
        <AudioSettingsDrawer
          open={audioSettingsDrawerOpen}
          onClose={() => setAudioSettingsDrawerOpen(false)}
          audioDevices={audioDevices}
          config={config}
          setConfig={setConfig}
        />
        <MetadataEditorDrawer
          open={metadataEditorOpen}
          onClose={() => {
            setMetadataEditorOpen(false)
            setMetadataEditorTrack(null)
          }}
          track={metadataEditorTrack}
          initialMetadata={
            metadataEditorTrack
              ? {
                  ...(trackMetaMap[metadataEditorTrack.path] || {}),
                  title:
                    trackMetaMap[metadataEditorTrack.path]?.title ||
                    parseTrackInfo(metadataEditorTrack, trackMetaMap[metadataEditorTrack.path])
                      ?.title ||
                    stripExtension(metadataEditorTrack.name || ''),
                  artist:
                    trackMetaMap[metadataEditorTrack.path]?.artist ||
                    parseTrackInfo(metadataEditorTrack, trackMetaMap[metadataEditorTrack.path])
                      ?.artist ||
                    '',
                  album:
                    trackMetaMap[metadataEditorTrack.path]?.album ||
                    parseTrackInfo(metadataEditorTrack, trackMetaMap[metadataEditorTrack.path])
                      ?.album ||
                    '',
                  cover:
                    trackMetaMap[metadataEditorTrack.path]?.cover ||
                    (currentTrack?.path === metadataEditorTrack.path ? coverUrl : null) ||
                    null
                }
              : null
          }
          onSave={handleSaveTrackMetadata}
        />
        <CastReceiveDrawer open={castDrawerOpen} onClose={() => setCastDrawerOpen(false)} />
        <CastSendDrawer
          open={castSendDrawerOpen}
          onClose={() => setCastSendDrawerOpen(false)}
          t={t}
          currentTrack={castSendCurrentTrack}
          isLocalPlaying={isPlaying}
          onLocalTakeover={async () => {
            if (isPlaying) await togglePlay()
          }}
        />
        <MvSettingsDrawer
          open={mvDrawerOpen}
          onClose={() => setMvDrawerOpen(false)}
          config={config}
          setConfig={setConfig}
          mvId={mvId}
          setMvId={setMvId}
          mvPlaybackQuality={mvPlaybackQuality}
          biliDirectStream={biliDirectStream}
          currentTrackTitle={displayMainTitle}
          currentTrackArtist={displayMainArtist}
          autoSearchResults={autoMvSearchResults}
          onAutoSearchCurrentMv={() => {
            const activeTrack =
              castVirtualTrack?.metadataTrusted && castVirtualTrack?.path
                ? castVirtualTrack
                : currentTrack
            if (!activeTrack?.path) return
            searchAndApplyMvForTrack({
              filePath: activeTrack.path,
              title: displayMainTitle,
              artist: displayMainArtist,
              hints: {
                album: displayMainAlbum || '',
                mvOriginUrl: activeTrack.mvOriginUrl || activeTrack.sourceUrl,
                sourceUrl: activeTrack.sourceUrl || activeTrack.mvOriginUrl
              },
              requestSeq: trackLoadSeqRef.current,
              force: true
            })
          }}
          onPersistMvOverride={(mv) => {
            const p =
              castVirtualTrack?.metadataTrusted && castVirtualTrack?.path
                ? castVirtualTrack.path
                : playlist[currentIndex]?.path
            if (p && mv?.id && mv?.source) setMvOverrideForPath(p, { ...mv, origin: 'manual' })
          }}
          onRestartPlayback={() => {
            lastMvLoadRestartKeyRef.current = ''
            setCurrentTime(0)
            syncYTVideo(0)
            if (useNativeEngineRef.current && window.api?.playAudio) {
              const tp = playlist[currentIndex]?.path
              if (tp) window.api.playAudio(tp, 0, playbackRateRef.current).catch(console.error)
            } else if (audioRef.current) {
              audioRef.current.currentTime = 0
            }
          }}
        />
        <PluginManagerDrawer open={pluginDrawerOpen} onClose={() => setPluginDrawerOpen(false)} />
        <PluginSlot name="drawers" />
        <div className="song-share-capture-root" aria-hidden>
          <div ref={songCardCaptureRef} className="song-share-card">
            {shareCardSnapshot?.cover ? (
              <div
                className="song-share-card-bg-image"
                style={{ backgroundImage: 'url(' + shareCardSnapshot.cover + ')' }}
              />
            ) : null}
            <div className="song-share-card-bg-overlay" />
            <div className="song-share-card-glow song-share-card-glow--a" />
            <div className="song-share-card-glow song-share-card-glow--b" />
            <div className="song-share-card-cover">
              {shareCardSnapshot?.cover ? (
                <img
                  src={shareCardSnapshot.cover}
                  alt={shareCardSnapshot.title || t('lyrics.coverAlt')}
                  className="song-share-card-cover-image"
                />
              ) : (
                <div className="song-share-card-cover-fallback">
                  <Music size={86} />
                </div>
              )}
            </div>
            <div className="song-share-card-meta">
              <p className="song-share-card-badge">ECHO</p>
              <h2 className="song-share-card-title">
                {shareCardSnapshot?.title || displayMainTitle || t('player.selectTrack')}
              </h2>
              <p className="song-share-card-artist">
                {shareCardSnapshot?.artist || displayMainArtist || t('common.unknownArtist')}
              </p>
              <p className="song-share-card-album">
                {shareCardSnapshot?.album || displayMainAlbum}
              </p>
              <div className="song-share-card-divider" />
              <div className="song-share-card-footer">
                <span className="song-share-card-chip">Hi-Fi Player</span>
                <span className="song-share-card-chip">Now Playing</span>
              </div>
            </div>
          </div>
        </div>
        {youtubeMvLoginHint && mvId?.source === 'youtube' && shouldLoadActiveMvMedia && (
          <div className="yt-mv-login-hint" role="status">
            <span className="yt-mv-login-hint-text">{t('youtubeHint.body')}</span>
            <div className="yt-mv-login-hint-actions">
              <button
                type="button"
                className="yt-mv-login-hint-btn"
                onClick={() => {
                  setView('settings')
                  setYoutubeMvLoginHint(false)
                }}
              >
                {t('youtubeHint.openSettings')}
              </button>
              <button
                type="button"
                className="yt-mv-login-hint-btn primary"
                onClick={() => {
                  setView('settings')
                  setActiveSettingsSection('integrations')
                  window.setTimeout(
                    () => scrollSettingsSectionIntoView('settings-sec-integrations'),
                    0
                  )
                  setYoutubeMvLoginHint(false)
                }}
              >
                {t('youtubeHint.signInNow')}
              </button>
              <button
                type="button"
                className="yt-mv-login-hint-dismiss"
                aria-label={t('aria.dismiss')}
                onClick={() => setYoutubeMvLoginHint(false)}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
        {trackContextMenu &&
          createPortal(
            <div
              ref={trackContextMenuRef}
              className={
                'track-ctx-menu-portal' + (ctxMenuVisualOpen ? ' track-ctx-menu-portal--open' : '')
              }
              role="menu"
              aria-label={t('aria.trackContextMenu')}
              style={{
                position: 'fixed',
                ...(() => {
                  const mw = 220
                  const mh = 480
                  let left = trackContextMenu.clientX
                  let top = trackContextMenu.clientY
                  const iw = typeof window !== 'undefined' ? window.innerWidth : 800
                  const ih = typeof window !== 'undefined' ? window.innerHeight : 600
                  if (left + mw > iw - 8) left = iw - mw - 8
                  if (top + mh > ih - 8) top = ih - mh - 8
                  return { left: Math.max(8, left), top: Math.max(8, top) }
                })(),
                zIndex: 20052
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {(() => {
                const track = trackContextMenu.track
                const info = parseTrackInfo(track, trackMetaMap[track?.path] || null)
                const inUpNext = upNextPathSet.has(track?.path)
                const trackLine = [info?.title || stripExtension(track?.name || ''), info?.artist]
                  .filter(Boolean)
                  .join(' - ')
                const removeLabel =
                  listMode === 'playlists' && selectedUserPlaylistId
                    ? t('contextMenu.removeFromPlaylist')
                    : t('contextMenu.removeFromQueue')
                const handleRemove = () => {
                  if (listMode === 'playlists' && selectedUserPlaylistId) {
                    removePathFromUserPlaylist(selectedUserPlaylistId, track.path)
                  } else {
                    removeTrackFromMainPlaylist(track.path)
                  }
                  closeTrackContextMenuAnimated()
                }
                return (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => {
                        openAddToPlaylistAtPoint(
                          trackContextMenu.clientX,
                          trackContextMenu.clientY,
                          track
                        )
                      }}
                    >
                      <Plus size={14} aria-hidden /> {t('contextMenu.addToPlaylist')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => {
                        if (inUpNext) {
                          moveUpNextPathToTop(track.path)
                        } else {
                          enqueueUpNextTrackAtFront(track)
                        }
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <SkipForward size={14} aria-hidden />{' '}
                      {t('queue.contextMenu.playNext', 'Play Next')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => {
                        if (inUpNext) {
                          removeFromUpNextQueue(track.path)
                        } else {
                          enqueueUpNextTrack(track)
                        }
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <ListPlus size={14} aria-hidden />{' '}
                      {inUpNext
                        ? t('contextMenu.removeFromUpNext')
                        : t('queue.contextMenu.addToQueue', 'Add to Queue')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={handleRemove}
                    >
                      <Minus size={14} aria-hidden /> {removeLabel}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => {
                        if (!isLocalAudioFilePath(track?.path)) {
                          closeTrackContextMenuAnimated()
                          return
                        }
                        openMetadataEditorForTrack(track)
                        closeTrackContextMenuAnimated()
                      }}
                      disabled={!isLocalAudioFilePath(track?.path)}
                    >
                      <Tag size={14} aria-hidden /> {t('contextMenu.editMetadata', 'Edit metadata')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => {
                        handleLocateTrackAlbum(track)
                      }}
                    >
                      <Disc size={14} aria-hidden />{' '}
                      {t('contextMenu.locateAlbum', 'Locate album')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await revealTrackInFolder(track)
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <FolderOpen size={14} aria-hidden /> {t('contextMenu.showInFolder')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await writeTextToClipboard(track.path || '')
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <Copy size={14} aria-hidden /> {t('contextMenu.copyPath')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await openTrackWithDefaultApp(track)
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <AppWindow size={14} aria-hidden /> {t('contextMenu.openWithDefaultApp')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await writeTextToClipboard(trackLine)
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <Copy size={14} aria-hidden /> {t('contextMenu.copyTrackLine')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await handleCopyTrackCardImage(track)
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <Image size={14} aria-hidden /> {t('contextMenu.copyTrackImage')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await handleSaveTrackCardImage(track)
                        closeTrackContextMenuAnimated()
                      }}
                    >
                      <Download size={14} aria-hidden /> {t('contextMenu.saveTrackImage')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item track-ctx-item--danger"
                      onClick={async () => {
                        closeTrackContextMenuAnimated()
                        await handleDeleteTrackFile(track)
                      }}
                      disabled={!isLocalAudioFilePath(track?.path)}
                    >
                      <Trash2 size={14} aria-hidden />{' '}
                      {t('contextMenu.deleteTrack', 'Delete track')}
                    </button>
                  </>
                )
              })()}
            </div>,
            document.body
          )}
        {groupContextMenu &&
          createPortal(
            <div
              ref={groupContextMenuRef}
              className={
                'track-ctx-menu-portal' + (groupCtxVisualOpen ? ' track-ctx-menu-portal--open' : '')
              }
              role="menu"
              aria-label={t('aria.groupContextMenu')}
              style={{
                position: 'fixed',
                ...(() => {
                  const mw = 220
                  const mh = 220
                  let left = groupContextMenu.clientX
                  let top = groupContextMenu.clientY
                  const iw = typeof window !== 'undefined' ? window.innerWidth : 800
                  const ih = typeof window !== 'undefined' ? window.innerHeight : 600
                  if (left + mw > iw - 8) left = iw - mw - 8
                  if (top + mh > ih - 8) top = ih - mh - 8
                  return { left: Math.max(8, left), top: Math.max(8, top) }
                })(),
                zIndex: 20052
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {(() => {
                const type = groupContextMenu.type
                const group = groupContextMenu.group
                const name = group?.name || ''
                const copyName = async () => {
                  try {
                    if (window.api?.writeClipboardText) {
                      const r = await window.api.writeClipboardText(name)
                      if (r && r.ok === false && r.error) {
                        alert(t('contextMenu.actionFailed', { detail: r.error }))
                      }
                    } else if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(name)
                    } else {
                      alert(t('contextMenu.actionFailed', { detail: 'clipboard_unavailable' }))
                    }
                  } catch (err) {
                    alert(t('contextMenu.actionFailed', { detail: err?.message || String(err) }))
                  }
                }
                return (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => {
                        if (type === 'album') {
                          handlePickAlbumFromSidebar(group)
                        } else {
                          handlePickFolderFromSidebar(group)
                        }
                        closeGroupContextMenuAnimated()
                      }}
                    >
                      <FolderOpen size={14} aria-hidden />{' '}
                      {type === 'album'
                        ? t('contextMenu.openAlbum', 'Open album')
                        : t('contextMenu.openFolder', 'Open folder')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => playGroupNow(type, group)}
                    >
                      <Play size={14} aria-hidden />{' '}
                      {t('contextMenu.playGroupNow', 'Play from here')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => queueGroupNext(group)}
                    >
                      <SkipForward size={14} aria-hidden />{' '}
                      {t('contextMenu.playGroupNext', 'Queue all next')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={async () => {
                        await copyName()
                        closeGroupContextMenuAnimated()
                      }}
                    >
                      <Copy size={14} aria-hidden /> {t('contextMenu.copyGroupName', 'Copy name')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="track-ctx-item"
                      onClick={() => revealGroupInExplorer(type, group)}
                    >
                      <FolderOpen size={14} aria-hidden />{' '}
                      {t('contextMenu.revealInExplorer', 'Show in Explorer')}
                    </button>
                  </>
                )
              })()}
            </div>,
            document.body
          )}
        {addToPlaylistMenu &&
          createPortal(
            <>
              <div
                className={
                  'add-to-pl-backdrop' + (addPlVisualOpen ? ' add-to-pl-backdrop--open' : '')
                }
                aria-hidden
                onMouseDown={() => closeAddToPlaylistAnimated()}
              />
              <div
                className={
                  'add-to-pl-menu-portal' + (addPlVisualOpen ? ' add-to-pl-menu-portal--open' : '')
                }
                role="dialog"
                aria-label={t('aria.addToPlaylistDialog')}
                style={{
                  position: 'fixed',
                  top: addToPlaylistMenu.top,
                  left: addToPlaylistMenu.left,
                  width: addToPlaylistMenu.width,
                  zIndex: 20050
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="add-to-pl-menu-header">{t('addToPl.header')}</div>
                <div className="add-to-pl-menu-body">
                  {userPlaylists.length === 0 ? (
                    <p className="add-to-pl-hint">{t('addToPl.noPlaylistsHint')}</p>
                  ) : (
                    userPlaylists.map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        className="add-to-pl-item"
                        onClick={() => addPathToUserPlaylist(pl.id, addToPlaylistMenu.path)}
                      >
                        {pl.name}
                      </button>
                    ))
                  )}
                  <div className="add-to-pl-new-block">
                    <span className="add-to-pl-new-label">{t('addToPl.createNewLabel')}</span>
                    <div className="add-to-pl-new-row">
                      <input
                        type="text"
                        className="add-to-pl-new-input"
                        placeholder={t('addToPl.namePlaceholder')}
                        value={quickNewPlaylistName}
                        onChange={(e) => setQuickNewPlaylistName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createPlaylistAndAddTrackFromPopover()
                        }}
                      />
                      <button
                        type="button"
                        className="add-to-pl-new-confirm"
                        onClick={createPlaylistAndAddTrackFromPopover}
                      >
                        {t('addToPl.add')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
      </div>

      {view !== 'settings' && !(showLyrics && hideImmersiveMvChrome) && (
        <div
          className={
            'bottom-player-bar no-drag' +
            (showLyrics ? ' bottom-player-bar--lyrics' : '') +
            (showLyrics && lyricsDockPresentation?.tone
              ? ` bottom-player-bar--lyrics-bg-${lyricsDockPresentation.tone}`
              : '')
          }
          style={
            showLyrics && lyricsDockPresentation?.dockStyle
              ? lyricsDockPresentation.dockStyle
              : undefined
          }
        >
          <div className="bottom-bar-left">
            {displaySafeCoverUrl ? (
              <img
                className="bottom-bar-cover"
                src={displaySafeCoverUrl}
                alt=""
                onClick={() => setShowLyrics(true)}
                onError={handleDisplayCoverError}
                draggable={false}
              />
            ) : (
              <div
                className="bottom-bar-cover-fallback"
                onClick={() => setShowLyrics(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowLyrics(true)
                }}
              >
                <Music size={20} />
              </div>
            )}
            <div className="bottom-bar-meta">
              <div className="bottom-bar-title" onClick={() => setShowLyrics(true)}>
                {displayMainTitle || t('player.selectTrack')}
              </div>
              <div className="bottom-bar-artist">{displayMainArtist || ''}</div>
              <div className="bottom-bar-tech-pills">
                <StreamingPlaybackTags track={currentTrack} variant="bottom" />
                {dlnaUiOn && <span className="mini-pill">{castPillLabel}</span>}
                {(currentBottomBarBpm || showBottomBarBpmDetecting) && (
                  <span className="echo-bpm-pill echo-bpm-pill--bottom">
                    {currentBottomBarBpm ? (
                      <>
                        BPM {currentBottomBarBpm}
                        {currentBottomBarAdjustedBpm ? ' -> ' + currentBottomBarAdjustedBpm : ''}
                      </>
                    ) : (
                      'BPM...'
                    )}
                  </span>
                )}
                <AudioQualityBadges
                  variant="player"
                  quality={{
                    codec: technicalInfo.codec || null,
                    bitrateKbps: technicalInfo.bitrate
                      ? Math.round(technicalInfo.bitrate / 1000)
                      : null,
                    sampleRateHz: technicalInfo.sampleRate || null,
                    bitDepth: technicalInfo.bitDepth || currentTrackMeta?.bitDepth || null,
                    channels: technicalInfo.channels || null,
                    isMqa: technicalInfo.isMqa === true || currentTrackMeta?.isMqa === true
                  }}
                />
              </div>
            </div>
          </div>

          <div className="bottom-bar-center">
            <div className="bottom-bar-transport">
              <button
                className="btn btn--transport bottom-bar-mini-trigger"
                style={{ width: 36, height: 36 }}
                onClick={openMiniPlayer}
                title={t('settings.miniPlayerOpen')}
              >
                <PictureInPicture2 size={16} />
              </button>
              <button
                className={`btn btn--transport play-mode-toggle ${playMode === 'shuffle' ? 'is-active' : ''}`}
                style={{ width: 36, height: 36 }}
                onClick={() => setPlayMode(playMode === 'shuffle' ? 'loop' : 'shuffle')}
                aria-pressed={playMode === 'shuffle'}
              >
                <Shuffle size={16} color="currentColor" />
              </button>
              <button className="btn btn--transport" onClick={handlePrev}>
                <SkipBack size={20} color="var(--text-soft)" />
              </button>
              <button className="btn play-btn" onClick={togglePlay}>
                {transportIsPlaying ? (
                  <Pause size={26} />
                ) : (
                  <Play size={26} style={{ marginLeft: 3 }} />
                )}
              </button>
              <button className="btn btn--transport" onClick={handleNext}>
                <SkipForward size={20} color="var(--text-soft)" />
              </button>
              <button
                className={`btn btn--transport play-mode-toggle ${
                  playMode === 'single' ? 'is-active' : ''
                }`}
                style={{ width: 36, height: 36 }}
                onClick={() => setPlayMode(playMode === 'single' ? 'loop' : 'single')}
                aria-pressed={playMode === 'single'}
              >
                {playMode === 'single' ? (
                  <Repeat1 size={16} color="var(--accent-pink)" />
                ) : (
                  <Repeat
                    size={16}
                    color={playMode === 'loop' ? 'var(--accent-pink)' : 'var(--text-soft)'}
                  />
                )}
              </button>
              <button
                className={'btn btn--transport lyrics-toggle ' + (showLyrics ? 'active' : '')}
                style={{ width: 36, height: 36 }}
                onClick={() => setShowLyrics(!showLyrics)}
                title={t('lyrics.toggle')}
              >
                <Mic2 size={17} color={showLyrics ? 'var(--accent-pink)' : 'currentColor'} />
              </button>
            </div>

            <PlayerProgressControl
              variant="bottom"
              position={displayProgressTime}
              duration={displayProgressDuration}
              isPlaying={transportIsPlaying}
              playbackRate={playbackRate}
              isDragging={isProgressDragging}
              disabled={dlnaUiOn}
              unknownDuration={dlnaUiOn && (!displayProgressDuration || displayProgressDuration <= 0)}
              onSeekChange={handleSeek}
              onSeekStart={(value) => {
                progressSeekValueRef.current = value
                isProgressDraggingRef.current = true
                setIsSeeking(true)
                setIsProgressDragging(true)
              }}
              onSeekCommit={commitProgressSeek}
            />
          </div>

          <div className="bottom-bar-right">
            {showLyrics ? (
              <div className="bottom-bar-lyrics-deck">
                <label className="bottom-bar-lyrics-slider">
                  <span>{playbackRate.toFixed(2)}x</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                    style={{
                      ['--slider-pct']:
                        Math.min(100, Math.max(0, ((playbackRate - 0.5) / 1.5) * 100)) + '%'
                    }}
                  />
                </label>
                <label className="bottom-bar-lyrics-slider">
                  <span>{Math.round(volume * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    style={{
                      ['--slider-pct']: Math.min(100, Math.max(0, volume * 100)) + '%'
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="bottom-bar-toolset">
                <button
                  ref={volumeDeckToolRef}
                  className={
                    'btn btn--transport deck-tool-trigger deck-tool-trigger--volume ' +
                    (activeDeckPopover === 'volume' ? 'active' : '')
                  }
                  onClick={() => toggleDeckPopover('volume')}
                  title={t('player.vol')}
                >
                  {volume <= 0.001 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <button
                  ref={speedDeckToolRef}
                  className={
                    'btn btn--transport deck-tool-trigger ' +
                    (activeDeckPopover === 'speed' ? 'active' : '')
                  }
                  onClick={() => toggleDeckPopover('speed')}
                  title={t('player.speed')}
                >
                  <Gauge size={16} />
                </button>
                <button
                  className="btn btn--transport deck-tool-trigger deck-tool-export"
                  onClick={() => {
                    handleExport()
                    setActiveDeckPopover(null)
                  }}
                  disabled={isExporting || !currentTrack}
                  title={t('player.exportButton')}
                >
                  <FileOutput size={16} />
                </button>
              </div>
            )}

            {!showLyrics &&
              activeDeckPopover &&
              createPortal(
                <div
                  className={
                    'deck-popover deck-popover--bottom-tools deck-popover--' + activeDeckPopover
                  }
                  style={deckPopoverStyle || undefined}
                >
                  {activeDeckPopover === 'volume' ? (
                    <div className="deck-popover-row deck-popover-volume-row">
                      <div className="deck-popover-header">
                        <span className="deck-popover-icon">
                          {volume <= 0.001 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </span>
                        <div className="deck-popover-label">
                          <span>{t('player.vol')}</span>
                          <span>{Math.round(volume * 100)}%</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        className="deck-popover-slider"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        style={{
                          ['--deck-slider-pct']: Math.min(100, Math.max(0, volume * 100)) + '%'
                        }}
                      />
                      <div className="deck-popover-scale" aria-hidden>
                        <span>0</span>
                        <span>100</span>
                      </div>
                    </div>
                  ) : (
                    <div className="deck-popover-row deck-popover-speed-row">
                      <div className="deck-popover-header">
                        <span className="deck-popover-icon">
                          <Gauge size={16} />
                        </span>
                        <div className="deck-popover-label">
                          <span>{t('player.speed')}</span>
                          <span>{playbackRate.toFixed(2)}x</span>
                        </div>
                        <button
                          className="deck-popover-btn deck-popover-speed-reset"
                          onClick={() => setPlaybackRate(1.0)}
                          title={t('player.resetSpeed') || 'Reset speed'}
                        >
                          <RotateCcw size={12} />
                          1x
                        </button>
                      </div>
                      <div className="deck-popover-control-row">
                        <input
                          type="range"
                          className="deck-popover-slider"
                          min={0.5}
                          max={2.0}
                          step={0.05}
                          value={playbackRate}
                          onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                          style={{
                            ['--deck-slider-pct']:
                              Math.min(100, Math.max(0, ((playbackRate - 0.5) / 1.5) * 100)) + '%'
                          }}
                        />
                      </div>
                      <div className="deck-popover-scale" aria-hidden>
                        <span>0.5x</span>
                        <span>2.0x</span>
                      </div>
                    </div>
                  )}
                </div>,
                document.body
              )}

            <PluginSlot
              name="playerTransportExtras"
              context={playerTransportPluginContext}
              className="no-drag transport-plugin-slot"
              style={{ display: 'flex', alignItems: 'center' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function trimMapCache(ref, maxEntries) {
  if (!ref?.current || !(ref.current instanceof Map) || ref.current.size <= maxEntries) return
  while (ref.current.size > maxEntries) {
    const firstKey = ref.current.keys().next().value
    if (firstKey === undefined) break
    ref.current.delete(firstKey)
  }
}
