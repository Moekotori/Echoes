import type { LyricLine, LyricsKind } from '../../shared/types/lyrics';

const metadataTagPattern = /^\s*\[(ar|ti|al|by|offset|length|re|ve):[^\]]*\]\s*$/i;
const timestampPattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const leadingTimestampsPattern = /^\s*(?:(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])\s*)+/;
const enhancedTimestampPattern = /<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g;

const fractionToMs = (fraction: string | undefined): number => {
  if (!fraction) {
    return 0;
  }

  if (fraction.length === 1) {
    return Number(fraction) * 100;
  }

  if (fraction.length === 2) {
    return Number(fraction) * 10;
  }

  return Number(fraction.slice(0, 3));
};

const parseTimestamp = (match: RegExpMatchArray): number | null => {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = fractionToMs(match[3]);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) {
    return null;
  }

  return minutes * 60_000 + seconds * 1000 + milliseconds;
};

const cleanLyricText = (text: string): string =>
  text
    .replace(enhancedTimestampPattern, '')
    .replace(/\s+/g, ' ')
    .trim();

const hasHan = (value: string): boolean => /\p{Script=Han}/u.test(value);
const hasKana = (value: string): boolean => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
const hasLatin = (value: string): boolean => /\p{Script=Latin}/u.test(value);
const hasHangul = (value: string): boolean => /\p{Script=Hangul}/u.test(value);

const hasEastAsianScript = (value: string): boolean =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);

const normalizeLineText = (value: string | null | undefined): string | null => {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized.length > 0 ? normalized : null;
};

const looksLikeRomanizationText = (value: string): boolean =>
  hasLatin(value) &&
  !hasEastAsianScript(value) &&
  /^[\p{Script=Latin}\d\s'"’.,!?():;+\-/&]+$/u.test(value);

const looksLikeTranslationText = (primaryText: string, value: string): boolean => {
  if (!hasHan(value) || hasKana(value) || hasHangul(value)) {
    return false;
  }

  return hasKana(primaryText) || hasLatin(primaryText) || hasHangul(primaryText) || !hasHan(primaryText);
};

const splitInlineTranslation = (value: string): Pick<LyricLine, 'text' | 'translation'> => {
  const delimiterPattern = /\s*[\/／]\s*/g;
  for (const match of value.matchAll(delimiterPattern)) {
    const delimiterIndex = match.index ?? -1;
    if (delimiterIndex <= 0) {
      continue;
    }

    const primaryText = normalizeLineText(value.slice(0, delimiterIndex));
    const translationText = normalizeLineText(value.slice(delimiterIndex + match[0].length));
    if (!primaryText || !translationText) {
      continue;
    }

    if (looksLikeTranslationText(primaryText, translationText)) {
      return { text: primaryText, translation: translationText };
    }
  }

  return { text: value };
};

const classifyAlternateLine = (
  primaryText: string,
  value: string,
  usedFields: Set<'romanization' | 'translation'>,
): 'romanization' | 'translation' | null => {
  if (!usedFields.has('romanization') && looksLikeRomanizationText(value)) {
    return 'romanization';
  }

  if (!usedFields.has('translation') && looksLikeTranslationText(primaryText, value)) {
    return 'translation';
  }

  return null;
};

const primaryLineScore = (line: LyricLine): number => {
  const text = normalizeLineText(line.text) ?? '';
  let score = 0;

  if (hasKana(text) || hasHangul(text)) {
    score += 8;
  } else if (hasHan(text)) {
    score += 6;
  } else if (hasEastAsianScript(text)) {
    score += 4;
  }

  if (looksLikeRomanizationText(text)) {
    score -= 10;
  }

  return score;
};

const selectPrimaryLineIndex = (group: LyricLine[]): number => {
  let primaryIndex = 0;
  let primaryScore = primaryLineScore(group[0]);

  for (let index = 1; index < group.length; index += 1) {
    const score = primaryLineScore(group[index]);
    if (score > primaryScore) {
      primaryIndex = index;
      primaryScore = score;
    }
  }

  return primaryIndex;
};

const collapseTimestampGroup = (group: LyricLine[]): LyricLine[] => {
  if (group.length <= 1) {
    return group;
  }

  const primaryIndex = selectPrimaryLineIndex(group);
  const primary = group[primaryIndex];
  const usedFields = new Set<'romanization' | 'translation'>();
  const collapsed: LyricLine = { ...primary };
  if (normalizeLineText(collapsed.romanization)) {
    usedFields.add('romanization');
  }
  if (normalizeLineText(collapsed.translation)) {
    usedFields.add('translation');
  }

  let changed = false;
  const pending: string[] = [];
  for (const [index, line] of group.entries()) {
    if (index === primaryIndex) {
      continue;
    }

    const alternateText = normalizeLineText(line.text);
    if (!alternateText || alternateText === collapsed.text) {
      continue;
    }

    const field = classifyAlternateLine(collapsed.text, alternateText, usedFields);
    if (field) {
      collapsed[field] = alternateText;
      usedFields.add(field);
      changed = true;
      continue;
    }

    pending.push(alternateText);
  }

  if (changed) {
    for (const alternateText of pending) {
      if (!usedFields.has('translation')) {
        collapsed.translation = alternateText;
        usedFields.add('translation');
        continue;
      }

      if (!usedFields.has('romanization')) {
        collapsed.romanization = alternateText;
        usedFields.add('romanization');
      }
    }

    return [collapsed];
  }

  return group;
};

export const normalizeSyncedLyricAlternates = (lines: LyricLine[]): LyricLine[] => {
  if (lines.length < 2) {
    return lines;
  }

  const normalized: LyricLine[] = [];
  let group: LyricLine[] = [];
  for (const line of lines) {
    if (line.timeMs < 0) {
      if (group.length > 0) {
        normalized.push(...collapseTimestampGroup(group));
        group = [];
      }
      normalized.push(line);
      continue;
    }

    if (group.length === 0 || group[0].timeMs === line.timeMs) {
      group.push(line);
      continue;
    }

    normalized.push(...collapseTimestampGroup(group));
    group = [line];
  }

  if (group.length > 0) {
    normalized.push(...collapseTimestampGroup(group));
  }

  return normalized;
};

export const parseSyncedLyrics = (lrcText: string): LyricLine[] => {
  const lines: LyricLine[] = [];

  for (const rawLine of lrcText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || metadataTagPattern.test(line)) {
      continue;
    }

    const timestamps = [...line.matchAll(timestampPattern)];
    if (!timestamps.length) {
      continue;
    }

    const leadingTimestamps = line.match(leadingTimestampsPattern)?.[0] ?? '';
    const leadingMatches = [...leadingTimestamps.matchAll(timestampPattern)];
    const hasOnlyLeadingTimestamps = timestamps.length === leadingMatches.length;

    if (hasOnlyLeadingTimestamps) {
      const text = cleanLyricText(line.slice(leadingTimestamps.length));
      if (!text) {
        continue;
      }

      for (const match of timestamps) {
        const timeMs = parseTimestamp(match);
        if (timeMs === null) {
          continue;
        }

        lines.push({ timeMs, ...splitInlineTranslation(text) });
      }

      continue;
    }

    for (let index = 0; index < timestamps.length; index += 1) {
      const match = timestamps[index];
      const timeMs = parseTimestamp(match);
      if (timeMs === null || match.index === undefined) {
        continue;
      }

      const textStart = match.index + match[0].length;
      const textEnd = timestamps[index + 1]?.index ?? line.length;
      const text = cleanLyricText(line.slice(textStart, textEnd));
      if (text) {
        lines.push({ timeMs, ...splitInlineTranslation(text) });
      }
    }
  }

  return lines.sort((left, right) => left.timeMs - right.timeMs);
};

export const parsePlainLyrics = (plainText: string): LyricLine[] =>
  plainText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text) => ({
      timeMs: -1,
      ...splitInlineTranslation(text),
    }));

export const detectLyricsKind = ({
  instrumental,
  plainLyrics,
  syncedLyrics,
}: {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean | null;
}): LyricsKind => {
  if (instrumental) {
    return 'instrumental';
  }

  if (syncedLyrics && parseSyncedLyrics(syncedLyrics).length > 0) {
    return 'synced';
  }

  if (plainLyrics && parsePlainLyrics(plainLyrics).length > 0) {
    return 'plain';
  }

  return 'empty';
};

export const serializeLyricLines = (lines: LyricLine[]): string => JSON.stringify(lines);

export const deserializeLyricLines = (linesJson: string): LyricLine[] => {
  try {
    const parsed = JSON.parse(linesJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((line): line is Record<string, unknown> => line && typeof line === 'object' && !Array.isArray(line))
      .map((line) => ({
        timeMs: Number(line.timeMs),
        text: typeof line.text === 'string' ? line.text : '',
        ...(typeof line.translation === 'string' ? { translation: line.translation } : {}),
        ...(typeof line.romanization === 'string' ? { romanization: line.romanization } : {}),
      }))
      .filter((line) => Number.isFinite(line.timeMs) && line.text.trim().length > 0);
  } catch {
    return [];
  }
};
