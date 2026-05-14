import { Buffer } from 'node:buffer';
import { parseSyncedLyrics } from '../../lyrics/lyricsParser';

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const streamingImageProxyUrl = (url: string | null, referer: string): string | null => {
  if (!url) {
    return null;
  }

  return `echo-image://remote/${encodeURIComponent(url)}?referer=${encodeURIComponent(referer)}`;
};

export const number = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const integer = (value: unknown): number | null => {
  const parsed = number(value);
  return parsed ? Math.round(parsed) : null;
};

export const jsonFetch = async (
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
    method?: 'GET' | 'POST';
    timeoutMs?: number;
  } = {},
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const response = await fetch(url, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 ECHO-Next/1.0',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`request_failed:${response.status}`);
    }

    const raw = (await response.text()).trim();
    const jsonText = raw.replace(/^[^(]*\((.*)\);?$/s, '$1');
    return JSON.parse(jsonText) as unknown;
  } finally {
    clearTimeout(timer);
  }
};

export const maybeDecodeBase64 = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) {
    return null;
  }

  if (raw.includes('[') || raw.includes('\n') || /[\u4e00-\u9fff]/u.test(raw) || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(raw)) {
    return raw;
  }

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    return decoded || raw;
  } catch {
    return raw;
  }
};

export const splitLyricsByKind = (value: string | null): { syncedLyrics: string | null; plainLyrics: string | null } => {
  if (!value) {
    return { syncedLyrics: null, plainLyrics: null };
  }

  return parseSyncedLyrics(value).length > 0
    ? { syncedLyrics: value, plainLyrics: null }
    : { syncedLyrics: null, plainLyrics: value };
};

export const linesFromLyrics = (syncedLyrics: string | null, plainLyrics: string | null) => {
  const syncedLines = syncedLyrics ? parseSyncedLyrics(syncedLyrics).map((line) => ({ timeMs: line.timeMs, text: line.text })) : [];
  if (syncedLines.length > 0) {
    return syncedLines;
  }

  return (plainLyrics ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ timeMs: null, text: line }));
};
