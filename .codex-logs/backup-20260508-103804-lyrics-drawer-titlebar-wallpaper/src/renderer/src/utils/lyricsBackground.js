import { relativeLuminance } from './color.js'
import { getAppThemeBackgroundStyle } from './themeColors.js'

export const DEFAULT_LYRICS_BACKGROUND_MODE = 'theme'
export const DEFAULT_LYRICS_BACKGROUND_COLOR = '#101722'
export const LYRICS_BACKGROUND_MODES = ['theme', 'cover', 'custom']

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function parseHexColor(value = '') {
  const hex = String(value || '').trim().toUpperCase()
  if (!HEX_COLOR_RE.test(hex)) return null
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  }
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) =>
    Math.max(0, Math.min(255, Math.round(channel)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function mixHex(a, b, aWeight = 0.5) {
  const ca = parseHexColor(a)
  const cb = parseHexColor(b)
  if (!ca || !cb) return normalizeLyricsBackgroundColor(a || b)
  const weight = Math.max(0, Math.min(1, Number(aWeight)))
  return rgbToHex({
    r: ca.r * weight + cb.r * (1 - weight),
    g: ca.g * weight + cb.g * (1 - weight),
    b: ca.b * weight + cb.b * (1 - weight)
  })
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function readableInkFor(surfaceColor) {
  const lightInk = '#F8FBFF'
  const darkInk = '#182233'
  return contrastRatio(lightInk, surfaceColor) >= contrastRatio(darkInk, surfaceColor)
    ? lightInk
    : darkInk
}

function readableFillFor(surfaceColor, accentColor, tone) {
  const mixed =
    tone === 'light'
      ? mixHex(accentColor, '#172033', 0.52)
      : mixHex(accentColor, '#FFFFFF', 0.46)
  const fallback = tone === 'light' ? '#56667C' : '#E9F0FA'
  return contrastRatio(mixed, surfaceColor) >= 2.4 ? mixed : fallback
}

const safePalette = (palette) => {
  if (!palette || typeof palette !== 'object') return null
  return {
    bgColor: normalizeLyricsBackgroundColor(palette.bgColor, '#101722'),
    bgGradientEnd: normalizeLyricsBackgroundColor(palette.bgGradientEnd, '#1f2937'),
    accent1: normalizeLyricsBackgroundColor(palette.accent1, '#8ea7ff'),
    accent2: normalizeLyricsBackgroundColor(palette.accent2, '#62d1d1'),
    accent3: normalizeLyricsBackgroundColor(palette.accent3, palette.accent1 || '#f0a6c8'),
    textMain: normalizeLyricsBackgroundColor(palette.textMain, '#f8fbff'),
    textSoft: normalizeLyricsBackgroundColor(palette.textSoft, '#c3cfdd'),
    bgGradientAngle:
      typeof palette.bgGradientAngle === 'number' && Number.isFinite(palette.bgGradientAngle)
        ? palette.bgGradientAngle
        : 135,
    bgMode: palette.bgMode === 'solid' ? 'solid' : 'linear'
  }
}

const toneFromColor = (hex) => (relativeLuminance(hex) > 0.56 ? 'light' : 'dark')

const textVarsForTone = (tone) =>
  tone === 'light'
    ? {
        '--text-main': '#182233',
        '--text-soft': '#667386'
      }
    : {
        '--text-main': '#f8fbff',
        '--text-soft': '#c8d3e2'
      }

export function normalizeLyricsBackgroundMode(value) {
  return LYRICS_BACKGROUND_MODES.includes(value) ? value : DEFAULT_LYRICS_BACKGROUND_MODE
}

export function normalizeLyricsBackgroundColor(value, fallback = DEFAULT_LYRICS_BACKGROUND_COLOR) {
  const candidate = String(value || '').trim()
  if (HEX_COLOR_RE.test(candidate)) return candidate.toUpperCase()
  return HEX_COLOR_RE.test(fallback) ? fallback.toUpperCase() : DEFAULT_LYRICS_BACKGROUND_COLOR
}

function buildThemeBackground(themePalette) {
  const palette = safePalette(themePalette)
  if (!palette) {
    return {
      background: 'linear-gradient(160deg, #101722 0%, #1f2937 100%)',
      tone: 'dark',
      baseColor: '#101722',
      accentColor: '#8EA7FF'
    }
  }
  const representativeColor =
    palette.bgMode === 'solid' ? palette.bgColor : mixHex(palette.bgColor, palette.bgGradientEnd, 0.58)
  const tone = toneFromColor(representativeColor)
  const themeBackgroundStyle = getAppThemeBackgroundStyle(palette, true)
  return {
    background:
      themeBackgroundStyle?.backgroundImage ||
      `linear-gradient(${palette.bgGradientAngle}deg, ${palette.bgColor}, ${palette.bgGradientEnd})`,
    tone,
    baseColor: representativeColor,
    accentColor: palette.accent1
  }
}

function buildCoverBackground(coverPalette) {
  const palette = safePalette(coverPalette)
  if (!palette) {
    return {
      background: 'linear-gradient(145deg, #101722 0%, #111827 52%, #05070d 100%)',
      tone: 'dark',
      baseColor: '#101722',
      accentColor: '#8EA7FF'
    }
  }
  const coverStart = mixHex(palette.bgColor, '#05070d', 0.34)
  const coverMid = mixHex(palette.accent1, '#0a1020', 0.28)
  const coverEnd = mixHex(palette.bgGradientEnd, '#02040a', 0.22)
  return {
    background: `linear-gradient(
      145deg,
      color-mix(in srgb, ${palette.bgColor} 34%, #05070d 66%) 0%,
      color-mix(in srgb, ${palette.accent1} 28%, #0a1020 72%) 52%,
      color-mix(in srgb, ${palette.bgGradientEnd} 22%, #02040a 78%) 100%
    )`,
    tone: 'dark',
    baseColor: mixHex(coverStart, mixHex(coverMid, coverEnd, 0.58), 0.48),
    accentColor: palette.accent1
  }
}

function buildCustomBackground(customColor) {
  const color = normalizeLyricsBackgroundColor(customColor)
  const tone = toneFromColor(color)
  const startColor = tone === 'light' ? mixHex(color, '#FFFFFF', 0.86) : mixHex(color, '#05070d', 0.86)
  const endColor = tone === 'light' ? mixHex(color, '#FFFFFF', 0.58) : mixHex(color, '#02040a', 0.58)
  const background =
    tone === 'light'
      ? `linear-gradient(160deg, color-mix(in srgb, ${color} 86%, #ffffff 14%) 0%, color-mix(in srgb, ${color} 58%, #ffffff 42%) 100%)`
      : `linear-gradient(160deg, color-mix(in srgb, ${color} 86%, #05070d 14%) 0%, color-mix(in srgb, ${color} 58%, #02040a 42%) 100%)`
  return {
    background,
    tone,
    baseColor: mixHex(startColor, endColor, 0.62),
    accentColor: color
  }
}

function buildDockStyle({ baseColor, accentColor, tone }) {
  const surfaceColor =
    tone === 'light'
      ? mixHex(baseColor, '#FFFFFF', 0.18)
      : mixHex(baseColor, '#05070d', 0.78)
  const ink = readableInkFor(surfaceColor)
  const soft = mixHex(ink, surfaceColor, tone === 'light' ? 0.68 : 0.76)
  const track = tone === 'light' ? 'rgba(24, 34, 48, 0.16)' : 'rgba(255, 255, 255, 0.24)'
  const fill = readableFillFor(surfaceColor, accentColor, tone)
  const thumbBorder = tone === 'light' ? mixHex(surfaceColor, '#1B2430', 0.82) : mixHex(surfaceColor, '#FFFFFF', 0.36)
  const background =
    tone === 'light'
      ? `linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.54)), color-mix(in srgb, ${baseColor} 20%, #ffffff 80%)`
      : `linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.24)), color-mix(in srgb, ${baseColor} 82%, #05070d 18%)`

  return {
    '--lyrics-bg-base': baseColor,
    '--lyrics-dock-background': background,
    '--lyrics-dock-border':
      tone === 'light' ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.16)',
    '--lyrics-dock-shadow':
      tone === 'light'
        ? '0 18px 46px rgba(58, 68, 82, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.74)'
        : '0 20px 54px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
    '--lyrics-dock-ink': ink,
    '--lyrics-dock-soft': soft,
    '--lyrics-dock-track': track,
    '--lyrics-dock-fill': fill,
    '--lyrics-dock-play-background':
      tone === 'light'
        ? `color-mix(in srgb, ${fill} 74%, #ffffff 26%)`
        : `color-mix(in srgb, ${fill} 28%, rgba(255, 255, 255, 0.16) 72%)`,
    '--lyrics-dock-play-ink': tone === 'light' ? '#FFFFFF' : '#FFFFFF',
    '--lyrics-dock-thumb-border': thumbBorder
  }
}

export function buildLyricsBackgroundPresentation({
  mode,
  customColor,
  coverPalette,
  themePalette
} = {}) {
  const normalizedMode = normalizeLyricsBackgroundMode(mode)
  const result =
    normalizedMode === 'custom'
      ? buildCustomBackground(customColor)
      : normalizedMode === 'theme'
        ? buildThemeBackground(themePalette)
        : buildCoverBackground(coverPalette, themePalette)

  return {
    mode: normalizedMode,
    tone: result.tone,
    className: `main-player--lyrics-bg-${normalizedMode} main-player--lyrics-bg-${result.tone}`,
    style: {
      '--lyrics-bg-fallback': result.background,
      background: result.background,
      ...buildDockStyle(result),
      ...textVarsForTone(result.tone)
    },
    dockStyle: {
      '--lyrics-bg-fallback': result.background,
      ...buildDockStyle(result)
    }
  }
}
