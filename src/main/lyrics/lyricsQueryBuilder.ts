import { basename } from 'node:path';
import type { LyricsQuery } from '../../shared/types/lyrics';
import { normalizeTextForSearch, normalizeTextForIdentity } from './lyricsTextNormalization';
import { extractLyricsVersionFlags, type LyricsVersionFlags } from './lyricsVersionFlags';

export type NormalizedLyricsQuery = {
  rawTitle: string;
  rawArtist: string;
  rawAlbum: string | null;
  durationSeconds: number | null;
  searchTitle: string;
  searchArtist: string;
  searchAlbum: string | null;
  identityTitle: string;
  identityArtist: string;
  identityAlbum: string | null;
  versionFlags: LyricsVersionFlags;
  coverIntent: boolean;
  hasReliableDuration: boolean;
  possibleOriginalTitle: string | null;
  possibleCoverTitle: string | null;
  searchVariants: Array<{
    title: string;
    artist: string;
    album: string | null;
    reason: string;
    priority: number;
  }>;
};

const cleanSearchValue = (value: string | null | undefined): string => normalizeTextForSearch(value);

const trimOrNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
};

const hasCoverIntent = (query: LyricsQuery): boolean => {
  const text = [query.title, query.album, query.filePath ? basename(query.filePath) : null].filter(Boolean).join(' ');

  return (
    extractLyricsVersionFlags(text).cover ||
    /cover collection|カバーコレクション|翻唱合集/iu.test(text.normalize('NFKC'))
  );
};

const pushVariant = (
  variants: NormalizedLyricsQuery['searchVariants'],
  next: NormalizedLyricsQuery['searchVariants'][number],
): void => {
  if (!next.title.trim()) {
    return;
  }

  const identity = `${normalizeTextForIdentity(next.title)}|${normalizeTextForIdentity(next.artist)}|${normalizeTextForIdentity(next.album)}`;
  if (variants.some((variant) => `${normalizeTextForIdentity(variant.title)}|${normalizeTextForIdentity(variant.artist)}|${normalizeTextForIdentity(variant.album)}` === identity)) {
    return;
  }

  variants.push(next);
};

export const buildNormalizedLyricsQuery = (query: LyricsQuery): NormalizedLyricsQuery => {
  const rawTitle = query.title.trim();
  const rawArtist = query.artist.trim();
  const rawAlbum = trimOrNull(query.album);
  const fileName = query.filePath ? basename(query.filePath) : null;
  const durationSeconds = Number.isFinite(Number(query.durationSeconds)) && Number(query.durationSeconds) > 0
    ? Number(query.durationSeconds)
    : null;
  const searchTitle = cleanSearchValue(rawTitle);
  const searchArtist = cleanSearchValue(rawArtist);
  const searchAlbum = rawAlbum ? cleanSearchValue(rawAlbum) : null;
  const identityTitle = normalizeTextForIdentity(rawTitle);
  const identityArtist = normalizeTextForIdentity(rawArtist);
  const identityAlbum = rawAlbum ? normalizeTextForIdentity(rawAlbum) : null;
  const versionFlags = extractLyricsVersionFlags(rawTitle, rawAlbum, rawArtist, fileName);
  const coverIntent = hasCoverIntent(query);
  const variants: NormalizedLyricsQuery['searchVariants'] = [];

  pushVariant(variants, {
    title: rawTitle,
    artist: rawArtist,
    album: rawAlbum,
    reason: 'raw_identity',
    priority: 100,
  });
  pushVariant(variants, {
    title: searchTitle || rawTitle,
    artist: searchArtist || rawArtist,
    album: searchAlbum,
    reason: 'search_normalized',
    priority: 80,
  });

  if (coverIntent) {
    pushVariant(variants, {
      title: searchTitle || rawTitle,
      artist: rawArtist,
      album: searchAlbum,
      reason: 'cover_intent_original_artist_unknown',
      priority: 70,
    });
  }

  return {
    rawTitle,
    rawArtist,
    rawAlbum,
    durationSeconds,
    searchTitle,
    searchArtist,
    searchAlbum,
    identityTitle,
    identityArtist,
    identityAlbum,
    versionFlags,
    coverIntent,
    hasReliableDuration: durationSeconds !== null && durationSeconds > 20,
    possibleOriginalTitle: coverIntent ? searchTitle || null : null,
    possibleCoverTitle: coverIntent ? rawTitle || null : null,
    searchVariants: variants,
  };
};
