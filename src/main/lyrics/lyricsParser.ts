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

        lines.push({ timeMs, text });
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
        lines.push({ timeMs, text });
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
      text,
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
