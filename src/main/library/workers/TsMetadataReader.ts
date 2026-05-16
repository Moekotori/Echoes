import { open } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import iconv from 'iconv-lite';
import { parseFile } from 'music-metadata';
import type { IAudioMetadata } from 'music-metadata';
import { shouldPreferTagLibForAlacTechnicalFields } from '../../audio/AlacTechnicalMetadata';
import { resolveCueTrack } from '../../audio/CueSheet';
import type { EmbeddedCoverData, FieldSource, FieldSources, MetadataFields, MetadataResult } from '../libraryTypes';
import type { MetadataReader } from './MetadataReader';

const unknownArtist = 'Unknown Artist';
const unknownAlbum = '';
const waveInfoTagIds = new Set(['IART', 'INAM', 'IPRD', 'IGNR', 'ICRD', 'ITRK']);
const tagLibPreferredExtensions = new Set([
  '.dsf',
  '.dff',
  '.wav',
  '.aiff',
  '.aif',
  '.ape',
  '.wv',
  '.tta',
  '.tak',
  '.caf',
  '.mka',
  '.mkv',
  '.m4a',
  '.m4b',
  '.mp4',
  '.mov',
  '.webm',
  '.mpc',
]);
const replaceableMetadataSources = new Set<FieldSource>(['unknown', 'filename_fallback', 'folder_structure', 'artist_fallback']);
const replaceableTechnicalSources = new Set<FieldSource>(['unknown', 'filename_fallback']);
const mojibakeCandidateEncodings = ['latin1', 'win1252', 'gbk', 'big5', 'shift_jis'] as const;
const suspiciousMojibakePattern = /(?:[\u00c0-\u00ff]{2,}|[\u00c2-\u00f4][\u0080-\u00bf]|[\u00c3\u00c2][\u0080-\u00ffA-Za-z]|[\u93c4\u71b7\u5a07\u9287\u958e\u59b5\u7d0b]{2,}|\u{fffd}|\?{2,})/u;
const mojibakeFragments = [
  '\u00c3',
  '\u00c2',
  '\u00d0',
  '\u00d1',
  '\u00d2',
  '\u00d3',
  '\u00c5',
  '\u00c6',
  '\u00c7',
  '\u00c8',
  '\u00c9',
  '\u00ca',
  '\u00cb',
  '\u9287',
  '\u9288',
  '\u93c4',
  '\u71b7',
  '\u59b5',
  '\u958e',
  '\u7d0b',
  '\u{fffd}',
];

type WaveInfoTags = Partial<Record<'IART' | 'INAM' | 'IPRD' | 'IGNR' | 'ICRD' | 'ITRK', string>>;

type TagLibFallbackFields = {
  [Key in keyof MetadataFields]?: MetadataFields[Key] | null;
};

type TagLibFallbackMetadata = {
  fields: TagLibFallbackFields;
  embeddedCover?: EmbeddedCoverData;
  warnings: string[];
};

const stripTrailingNulls = (buffer: Buffer): Buffer => {
  let end = buffer.length;
  while (end > 0 && buffer[end - 1] === 0) {
    end -= 1;
  }

  return buffer.subarray(0, end);
};

const countMatches = (text: string, pattern: RegExp): number => Array.from(text.matchAll(pattern)).length;

const countControlCharacters = (text: string): number => {
  let count = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if ((codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      count += 1;
    }
  }

  return count;
};

const textQualityScore = (text: string): number => {
  let score = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === '\uFFFD') {
      score -= 40;
      continue;
    }

    if ((codePoint >= 0 && codePoint < 32 && ![9, 10, 13].includes(codePoint)) || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      score -= 25;
      continue;
    }

    if (codePoint >= 0x2460 && codePoint <= 0x24ff) {
      score -= 8;
      continue;
    }

    if (
      (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
      (codePoint >= 0x3400 && codePoint <= 0x9fff) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af)
    ) {
      score += 4;
      continue;
    }

    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      score += 1;
      continue;
    }

    score += 0.5;
  }

  score -= countMatches(text, /[\uFFFD?]/gu) * 18;
  score -= countControlCharacters(text) * 20;
  score -= countMatches(text, /(?:[\u00c2-\u00f4][\u0080-\u00bf]|[\u00c3\u00c2][\u0080-\u00ffA-Za-z]|\u00e2[\u0080-\u00ff]{1,2})/gu) * 12;
  for (const fragment of mojibakeFragments) {
    score -= text.split(fragment).length - 1;
  }

  return score;
};

export const repairMojibakeText = (value: string): string => {
  const trimmed = value.trim();
  if (!suspiciousMojibakePattern.test(trimmed)) {
    return trimmed;
  }

  const candidates = mojibakeCandidateEncodings.flatMap((encoding) => {
    try {
      const decoded = iconv.decode(iconv.encode(trimmed, encoding), 'utf8').trim();
      if (!decoded || decoded === trimmed) {
        return [];
      }

      return [{ text: decoded, score: textQualityScore(decoded) }];
    } catch {
      return [];
    }
  });

  const originalScore = textQualityScore(trimmed);
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];

  return best && best.score >= originalScore + 4 ? best.text : trimmed;
};

const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = repairMojibakeText(value);
  return trimmed.length > 0 ? trimmed : null;
};

const cleanTextList = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return cleanText(value.find((item) => cleanText(item)));
  }

  return cleanText(value);
};

export const decodeWaveInfoText = (rawValue: Buffer): string | null => {
  const data = stripTrailingNulls(rawValue);
  if (data.length === 0) {
    return null;
  }

  const candidates = ['utf-8', 'gbk', 'shift_jis', 'big5', 'windows-1252'].flatMap((encoding) => {
    try {
      const text = new TextDecoder(encoding).decode(data).trim();
      return text.length > 0 ? [{ text, score: textQualityScore(text) }] : [];
    } catch {
      return [];
    }
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.text ?? null;
};

const readWaveInfoTags = async (filePath: string): Promise<WaveInfoTags> => {
  if (extname(filePath).toLowerCase() !== '.wav') {
    return {};
  }

  const file = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const headerRead = await file.read(header, 0, header.length, 0);
    if (headerRead.bytesRead < header.length || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      return {};
    }

    const fileSize = (await file.stat()).size;
    const tags: WaveInfoTags = {};
    let position = 12;

    while (position + 8 <= fileSize) {
      const chunkHeader = Buffer.alloc(8);
      const chunkHeaderRead = await file.read(chunkHeader, 0, chunkHeader.length, position);
      if (chunkHeaderRead.bytesRead < chunkHeader.length) {
        break;
      }

      const chunkId = chunkHeader.toString('ascii', 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      const chunkDataPosition = position + 8;

      if (chunkId === 'LIST' && chunkSize >= 4) {
        const listType = Buffer.alloc(4);
        const listTypeRead = await file.read(listType, 0, listType.length, chunkDataPosition);
        if (listTypeRead.bytesRead === listType.length && listType.toString('ascii') === 'INFO') {
          let infoPosition = chunkDataPosition + 4;
          const infoEnd = Math.min(chunkDataPosition + chunkSize, fileSize);

          while (infoPosition + 8 <= infoEnd) {
            const infoHeader = Buffer.alloc(8);
            const infoHeaderRead = await file.read(infoHeader, 0, infoHeader.length, infoPosition);
            if (infoHeaderRead.bytesRead < infoHeader.length) {
              break;
            }

            const infoId = infoHeader.toString('ascii', 0, 4);
            const infoSize = infoHeader.readUInt32LE(4);
            const infoDataPosition = infoPosition + 8;

            if (waveInfoTagIds.has(infoId) && infoDataPosition + infoSize <= fileSize) {
              const value = Buffer.alloc(infoSize);
              const valueRead = await file.read(value, 0, value.length, infoDataPosition);
              if (valueRead.bytesRead === value.length) {
                const decoded = decodeWaveInfoText(value);
                if (decoded) {
                  tags[infoId as keyof WaveInfoTags] = decoded;
                }
              }
            }

            infoPosition += 8 + infoSize + (infoSize % 2);
          }
        }
      }

      position += 8 + chunkSize + (chunkSize % 2);
    }

    return tags;
  } finally {
    await file.close();
  }
};

const guessFromFilename = (filePath: string): { artist: string | null; title: string } => {
  const name = basename(filePath, extname(filePath)).trim();
  const parts = name.split(' - ').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      artist: parts[0],
      title: parts.slice(1).join(' - '),
    };
  }

  return {
    artist: null,
    title: name || 'Untitled',
  };
};

const folderAlbumFallback = (filePath: string): string | null => {
  const folderName = basename(dirname(filePath)).trim();
  return folderName.length > 0 ? folderName : null;
};

const codecFallback = (filePath: string, embeddedCodec: string | undefined): string | null => {
  const codec = cleanText(embeddedCodec);
  if (codec) {
    return codec;
  }

  const extension = extname(filePath).replace('.', '').toUpperCase();
  return extension.length > 0 ? extension : null;
};

const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const positiveFloatOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const yearFromMetadata = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const match = value.match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  return null;
};

const firstText = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return cleanText(value.find((item) => cleanText(item)));
  }

  return cleanText(value);
};

const firstNumber = (value: unknown): number | null => {
  const parseOne = (item: unknown): number | null => {
    const parsed = numberOrNull(item);
    if (parsed !== null) {
      return parsed;
    }

    if (typeof item === 'string') {
      const match = item.match(/^\s*(\d+)/u);
      return match ? numberOrNull(match[1]) : null;
    }

    return null;
  };

  if (Array.isArray(value)) {
    return parseOne(value.find((item) => parseOne(item) !== null));
  }

  return parseOne(value);
};

const tagValue = (tags: Record<string, unknown>, keys: string[]): unknown => {
  const normalizedEntries = Object.entries(tags).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), value] as const);

  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const directValue = tags[key];
    if (directValue !== undefined) {
      return directValue;
    }

    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) {
      return match[1];
    }
  }

  return undefined;
};

const nativeValues = (metadata: IAudioMetadata, keys: string[]): unknown[] => {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const values: unknown[] = [];

  for (const entries of Object.values(metadata.native ?? {})) {
    for (const entry of entries) {
      const id = typeof entry.id === 'string' ? entry.id.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      if (normalizedKeys.has(id)) {
        values.push(entry.value);
      }
    }
  }

  return values;
};

const firstNativeText = (metadata: IAudioMetadata, keys: string[]): string | null =>
  firstText(nativeValues(metadata, keys));

const firstNativeNumber = (metadata: IAudioMetadata, keys: string[]): number | null => {
  for (const value of nativeValues(metadata, keys)) {
    const parsed = firstNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const firstNativeYear = (metadata: IAudioMetadata, keys: string[]): number | null => {
  for (const value of nativeValues(metadata, keys)) {
    const parsed = yearFromMetadata(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const warningMessage = (prefix: string, error: unknown): string =>
  `${prefix}: ${error instanceof Error ? error.message : String(error)}`;

const hasTagLibFieldData = (metadata: TagLibFallbackMetadata): boolean =>
  Object.values(metadata.fields).some((value) => value !== null && value !== undefined && value !== '') || Boolean(metadata.embeddedCover);

const normalizeTagLibBitrate = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 1000);
};

const normalizeTagLibCodec = (properties: Record<string, unknown> | undefined): string | null => {
  const codec = cleanText(properties?.codec);
  if (codec && codec.toLowerCase() !== 'unknown') {
    return codec;
  }

  const container = cleanText(properties?.containerFormat);
  return container && container.toLowerCase() !== 'unknown' ? container : null;
};

export const readTagLibFallbackMetadata = async (filePath: string): Promise<TagLibFallbackMetadata> => {
  const warnings: string[] = [];

  try {
    const taglib = await import('taglib-wasm');
    const metadata = await taglib.readMetadata(filePath);
    const tags = (metadata.tags ?? {}) as Record<string, unknown>;
    const properties = (metadata.properties ?? {}) as Record<string, unknown> | undefined;
    let embeddedCover: EmbeddedCoverData | undefined;

    if (metadata.hasCoverArt) {
      try {
        const pictures = await taglib.readPictures(filePath);
        const picture = pictures.find((item) => item.type === 'FrontCover') ?? pictures[0];
        if (picture?.data?.byteLength) {
          embeddedCover = {
            data: picture.data,
            mimeType: cleanText(picture.mimeType),
          };
        }
      } catch (error) {
        warnings.push(warningMessage('taglib_cover_unavailable', error));
      }
    }

    return {
      fields: {
        title: firstText(tagValue(tags, ['title'])),
        artist: firstText(tagValue(tags, ['artist', 'artists'])),
        album: firstText(tagValue(tags, ['album'])),
        albumArtist: firstText(tagValue(tags, ['albumArtist', 'albumartist', 'album_artist'])),
        trackNo: firstNumber(tagValue(tags, ['track', 'trackNumber', 'tracknumber'])),
        discNo: firstNumber(tagValue(tags, ['discNumber', 'discnumber', 'disc', 'disk'])),
        year: yearFromMetadata(tagValue(tags, ['year', 'date', 'originalDate', 'originaldate'])),
        genre: firstText(tagValue(tags, ['genre'])),
        duration: positiveFloatOrNull(properties?.duration),
        codec: normalizeTagLibCodec(properties),
        sampleRate: numberOrNull(properties?.sampleRate),
        bitDepth: numberOrNull(properties?.bitsPerSample),
        bitrate: normalizeTagLibBitrate(properties?.bitrate),
        bpm: positiveFloatOrNull(tagValue(tags, ['bpm'])),
      },
      embeddedCover,
      warnings,
    };
  } catch (error) {
    return {
      fields: {},
      warnings: [warningMessage('taglib_metadata_unavailable', error)],
    };
  }
};

const fallbackFields = (filePath: string): MetadataResult => {
  const filenameGuess = guessFromFilename(filePath);
  const folderAlbum = folderAlbumFallback(filePath);
  const artist = filenameGuess.artist ?? unknownArtist;
  const album = folderAlbum ?? unknownAlbum;
  const codec = codecFallback(filePath, undefined);

  return {
    fields: {
      title: filenameGuess.title,
      artist,
      album,
      albumArtist: artist,
      trackNo: null,
      discNo: null,
      year: null,
      genre: null,
      duration: 0,
      codec,
      sampleRate: null,
      bitDepth: null,
      bitrate: null,
      bpm: null,
    },
    fieldSources: {
      title: 'filename_fallback',
      artist: filenameGuess.artist ? 'filename_fallback' : 'unknown',
      album: folderAlbum ? 'folder_structure' : 'unknown',
      albumArtist: filenameGuess.artist ? 'artist_fallback' : 'unknown',
      trackNo: 'unknown',
      discNo: 'unknown',
      year: 'unknown',
      genre: 'unknown',
      duration: 'unknown',
      codec: codec ? 'filename_fallback' : 'unknown',
      sampleRate: 'unknown',
      bitDepth: 'unknown',
      bitrate: 'unknown',
      bpm: 'unknown',
    },
    embeddedMetadataStatus: 'missing',
    embeddedCoverStatus: 'missing',
    warnings: [],
    errors: [],
    status: 'fallback',
  };
};

export class TsMetadataReader implements MetadataReader {
  async read(filePath: string): Promise<MetadataResult> {
    const cueTrack = resolveCueTrack(filePath);
    const metadataPath = cueTrack?.audioPath ?? filePath;

    try {
      const metadata = await parseFile(metadataPath, {
        duration: true,
        skipCovers: false,
      });

      if (!cueTrack) {
        const waveInfoTags = await readWaveInfoTags(filePath).catch(() => ({}));
        return this.normalizeWithFallback(filePath, metadataPath, metadata, waveInfoTags);
      }

      const waveInfoTags = await readWaveInfoTags(metadataPath).catch(() => ({}));
      const normalized = await this.normalizeWithFallback(metadataPath, metadataPath, metadata, waveInfoTags);
      const sourceDuration = normalized.fields.duration;
      const cueEndSeconds = cueTrack.endSeconds ?? (sourceDuration > 0 ? sourceDuration : null);
      const duration = cueEndSeconds !== null ? Math.max(0, cueEndSeconds - cueTrack.startSeconds) : 0;
      const title = cueTrack.title ?? normalized.fields.title;
      const artist = cueTrack.performer ?? cueTrack.albumArtist ?? normalized.fields.artist;
      const album = cueTrack.album ?? normalized.fields.album;
      const albumArtist = cueTrack.albumArtist ?? artist;

      return {
        ...normalized,
        fields: {
          ...normalized.fields,
          title,
          artist,
          album,
          albumArtist,
          trackNo: cueTrack.trackNumber,
          duration,
          codec: normalized.fields.codec ? `CUE/${normalized.fields.codec}` : 'CUE',
        },
        fieldSources: {
          ...normalized.fieldSources,
          title: cueTrack.title ? 'sidecar' : normalized.fieldSources.title,
          artist: cueTrack.performer || cueTrack.albumArtist ? 'sidecar' : normalized.fieldSources.artist,
          album: cueTrack.album ? 'sidecar' : normalized.fieldSources.album,
          albumArtist: cueTrack.albumArtist ? 'sidecar' : normalized.fieldSources.albumArtist,
          trackNo: 'sidecar',
          duration: 'sidecar',
          codec: normalized.fieldSources.codec ?? 'technical',
        },
        embeddedMetadataStatus: 'present',
        warnings: normalized.warnings,
        errors: normalized.errors,
        status: normalized.status,
      };
    } catch (error) {
      if (cueTrack) {
        return {
          fields: {
            title: cueTrack.title ?? `Track ${cueTrack.trackNumber}`,
            artist: cueTrack.performer ?? cueTrack.albumArtist ?? unknownArtist,
            album: cueTrack.album ?? folderAlbumFallback(cueTrack.cuePath) ?? unknownAlbum,
            albumArtist: cueTrack.albumArtist ?? cueTrack.performer ?? unknownArtist,
            trackNo: cueTrack.trackNumber,
            discNo: null,
            year: null,
            genre: null,
            duration: cueTrack.endSeconds !== null ? Math.max(0, cueTrack.endSeconds - cueTrack.startSeconds) : 0,
            codec: 'CUE',
            sampleRate: null,
            bitDepth: null,
            bitrate: null,
            bpm: null,
          },
          fieldSources: {
            title: cueTrack.title ? 'sidecar' : 'filename_fallback',
            artist: cueTrack.performer || cueTrack.albumArtist ? 'sidecar' : 'unknown',
            album: cueTrack.album ? 'sidecar' : 'folder_structure',
            albumArtist: cueTrack.albumArtist || cueTrack.performer ? 'sidecar' : 'unknown',
            trackNo: 'sidecar',
            discNo: 'unknown',
            year: 'unknown',
            genre: 'unknown',
            duration: cueTrack.endSeconds !== null ? 'sidecar' : 'unknown',
            codec: 'sidecar',
            sampleRate: 'unknown',
            bitDepth: 'unknown',
            bitrate: 'unknown',
            bpm: 'unknown',
          },
          embeddedMetadataStatus: 'present',
          embeddedCoverStatus: 'missing',
          warnings: [],
          errors: [error instanceof Error ? error.message : String(error)],
          status: 'fallback',
        };
      }

      const result = fallbackFields(filePath);
      const tagLibMetadata = await readTagLibFallbackMetadata(filePath);
      const merged = this.applyTagLibFallback(result, tagLibMetadata, filePath);
      const recovered = hasTagLibFieldData(tagLibMetadata);

      return {
        ...merged,
        status: recovered ? 'ok' : 'error',
        warnings: [...merged.warnings, warningMessage('music_metadata_unavailable', error)],
        errors: recovered ? [] : [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async normalizeWithFallback(
    filePath: string,
    metadataPath: string,
    metadata: IAudioMetadata,
    waveInfoTags: WaveInfoTags = {},
  ): Promise<MetadataResult> {
    const normalized = this.normalize(filePath, metadata, waveInfoTags);

    if (!this.shouldReadTagLibFallback(metadataPath, normalized)) {
      return normalized;
    }

    return this.applyTagLibFallback(normalized, await readTagLibFallbackMetadata(metadataPath), metadataPath);
  }

  private shouldReadTagLibFallback(filePath: string, result: MetadataResult): boolean {
    if (tagLibPreferredExtensions.has(extname(filePath).toLowerCase())) {
      return true;
    }

    if (result.embeddedCoverStatus !== 'present') {
      return true;
    }

    return ['title', 'artist', 'album', 'albumArtist', 'trackNo', 'discNo', 'year', 'genre', 'bpm'].some((field) =>
      replaceableMetadataSources.has(result.fieldSources[field] ?? 'unknown'),
    );
  }

  private applyTagLibFallback(result: MetadataResult, tagLibMetadata: TagLibFallbackMetadata, filePath: string): MetadataResult {
    const fields: MetadataFields = { ...result.fields };
    const fieldSources: FieldSources = { ...result.fieldSources };
    let embeddedMetadataStatus = result.embeddedMetadataStatus;
    const preferTagLibAlacTechnicalFields = shouldPreferTagLibForAlacTechnicalFields(
      filePath,
      fields.codec,
      tagLibMetadata.fields.codec,
    );

    const applyEmbedded = <Key extends keyof MetadataFields>(field: Key, value: MetadataFields[Key] | null | undefined): void => {
      if (value === null || value === undefined || value === '') {
        return;
      }

      if (!replaceableMetadataSources.has(fieldSources[field] ?? 'unknown')) {
        return;
      }

      fields[field] = value;
      fieldSources[field] = 'embedded';
      embeddedMetadataStatus = 'present';
    };

    const applyTechnical = <Key extends keyof MetadataFields>(field: Key, value: MetadataFields[Key] | null | undefined): void => {
      if (value === null || value === undefined || value === '') {
        return;
      }

      const canOverride =
        preferTagLibAlacTechnicalFields &&
        (field === 'codec' || field === 'sampleRate' || field === 'bitDepth' || field === 'bitrate');
      if (!canOverride && !replaceableTechnicalSources.has(fieldSources[field] ?? 'unknown')) {
        return;
      }

      fields[field] = value;
      fieldSources[field] = 'technical';
    };

    applyEmbedded('title', tagLibMetadata.fields.title);
    applyEmbedded('artist', tagLibMetadata.fields.artist);
    applyEmbedded('album', tagLibMetadata.fields.album);
    applyEmbedded('albumArtist', tagLibMetadata.fields.albumArtist);
    applyEmbedded('trackNo', tagLibMetadata.fields.trackNo);
    applyEmbedded('discNo', tagLibMetadata.fields.discNo);
    applyEmbedded('year', tagLibMetadata.fields.year);
    applyEmbedded('genre', tagLibMetadata.fields.genre);
    applyEmbedded('bpm', tagLibMetadata.fields.bpm);
    applyTechnical('duration', tagLibMetadata.fields.duration);
    applyTechnical('codec', tagLibMetadata.fields.codec);
    applyTechnical('sampleRate', tagLibMetadata.fields.sampleRate);
    applyTechnical('bitDepth', tagLibMetadata.fields.bitDepth);
    applyTechnical('bitrate', tagLibMetadata.fields.bitrate);

    const embeddedCover = result.embeddedCover ?? tagLibMetadata.embeddedCover;

    return {
      ...result,
      fields,
      fieldSources,
      embeddedCover,
      embeddedMetadataStatus,
      embeddedCoverStatus: embeddedCover ? 'present' : result.embeddedCoverStatus,
      warnings: [...result.warnings, ...tagLibMetadata.warnings],
    };
  }

  normalize(filePath: string, metadata: IAudioMetadata, waveInfoTags: WaveInfoTags = {}): MetadataResult {
    const common = metadata.common;
    const format = metadata.format;
    const filenameGuess = guessFromFilename(filePath);
    const fieldSources: FieldSources = {};

    // Fixed priority: manual > embedded > sidecar/info > folder inference > network completion > filename fallback.
    // Phase v0.1 implements embedded tags, folder album fallback, and filename fallback; source names stay stable
    // so a future Rust/C++ reader can return the same shape without changing SQLite, IPC, or renderer code.
    const pickText = (field: string, embeddedValue: string | null, fallbackValue: string, fallbackSource: FieldSource) => {
      if (embeddedValue) {
        fieldSources[field] = 'embedded';
        return embeddedValue;
      }

      fieldSources[field] = fallbackSource;
      return fallbackValue;
    };

    const pickNumber = (field: string, value: number | null): number | null => {
      fieldSources[field] = value !== null ? 'embedded' : 'unknown';
      return value;
    };

    const embeddedTitle = cleanText(waveInfoTags.INAM) ?? cleanText(common.title) ?? firstNativeText(metadata, ['TITLE', 'TIT2', 'INAM']);
    const embeddedArtist =
      cleanText(waveInfoTags.IART) ?? cleanText(common.artist) ?? cleanTextList(common.artists) ?? firstNativeText(metadata, ['ARTIST', 'TPE1', 'IART']);
    const embeddedAlbum = cleanText(waveInfoTags.IPRD) ?? cleanText(common.album) ?? firstNativeText(metadata, ['ALBUM', 'TALB', 'IPRD']);
    const embeddedAlbumArtist = cleanTextList(common.albumartist) ?? firstNativeText(metadata, ['ALBUMARTIST', 'ALBUM ARTIST', 'ALBUM_ARTIST', 'TPE2']);
    const embeddedGenre = cleanText(waveInfoTags.IGNR) ?? cleanTextList(common.genre) ?? firstNativeText(metadata, ['GENRE', 'TCON', 'IGNR']);
    const embeddedTrackNo = numberOrNull(waveInfoTags.ITRK) ?? numberOrNull(common.track?.no) ?? firstNativeNumber(metadata, ['TRACKNUMBER', 'TRACK', 'TRCK', 'ITRK']);
    const embeddedYear = yearFromMetadata(waveInfoTags.ICRD) ?? yearFromMetadata(common.year ?? common.date);
    const folderAlbum = folderAlbumFallback(filePath);

    const title = pickText('title', embeddedTitle, filenameGuess.title, 'filename_fallback');
    const artist = pickText('artist', embeddedArtist, filenameGuess.artist ?? unknownArtist, filenameGuess.artist ? 'filename_fallback' : 'unknown');
    const album = pickText('album', embeddedAlbum, folderAlbum ?? unknownAlbum, folderAlbum ? 'folder_structure' : 'unknown');
    const albumArtist = pickText('albumArtist', embeddedAlbumArtist, artist, 'artist_fallback');
    const trackNo = pickNumber('trackNo', embeddedTrackNo);
    const discNo = pickNumber('discNo', numberOrNull(common.disk?.no) ?? firstNativeNumber(metadata, ['DISCNUMBER', 'DISKNUMBER', 'DISC', 'DISK', 'TPOS']));
    const year = pickNumber('year', embeddedYear ?? firstNativeYear(metadata, ['DATE', 'YEAR', 'ORIGINALDATE', 'ORIGINALYEAR', 'ICRD', 'TDRC']));
    const genre = embeddedGenre;
    fieldSources.genre = genre ? 'embedded' : 'unknown';
    const duration = Math.max(0, Number(format.duration ?? 0));
    fieldSources.duration = duration > 0 ? 'technical' : 'unknown';
    const codec = codecFallback(filePath, format.codec);
    fieldSources.codec = codec ? (format.codec ? 'technical' : 'filename_fallback') : 'unknown';
    const sampleRate = typeof format.sampleRate === 'number' ? format.sampleRate : null;
    fieldSources.sampleRate = sampleRate ? 'technical' : 'unknown';
    const bitDepth = typeof format.bitsPerSample === 'number' ? format.bitsPerSample : null;
    fieldSources.bitDepth = bitDepth ? 'technical' : 'unknown';
    const bitrate = typeof format.bitrate === 'number' ? Math.round(format.bitrate) : null;
    fieldSources.bitrate = bitrate ? 'technical' : 'unknown';
    const bpm = positiveFloatOrNull(common.bpm) ?? firstNativeNumber(metadata, ['BPM', 'TBPM']);
    fieldSources.bpm = bpm ? 'embedded' : 'unknown';
    const picture = common.picture?.[0];
    const hasEmbeddedMetadata = [
      embeddedTitle,
      embeddedArtist,
      embeddedAlbum,
      embeddedAlbumArtist,
      embeddedGenre,
      trackNo,
      discNo,
      year,
    ].some((value) => value !== null && value !== undefined && value !== '');

    const fields: MetadataFields = {
      title,
      artist,
      album,
      albumArtist,
      trackNo,
      discNo,
      year,
      genre,
      duration,
      codec,
      sampleRate,
      bitDepth,
      bitrate,
      bpm,
    };

    return {
      fields,
      fieldSources,
      embeddedCover: picture
        ? {
            data: picture.data,
            mimeType: cleanText(picture.format),
          }
        : undefined,
      embeddedMetadataStatus: hasEmbeddedMetadata ? 'present' : 'missing',
      embeddedCoverStatus: picture ? 'present' : 'missing',
      warnings: [],
      errors: [],
      status: 'ok',
    };
  }
}
