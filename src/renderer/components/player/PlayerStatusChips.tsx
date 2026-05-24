import type { AudioStatus } from '../../../shared/types/audio';
import { isDisplayableBpmAnalysis } from '../../../shared/constants/audioAnalysis';
import type { LibraryTrack } from '../../../shared/types/library';
import { isHiResAudioSpec } from '../../../shared/utils/audioQuality';

type PlayerStatusChipsProps = {
  status: AudioStatus | null;
  state: string;
  track: LibraryTrack | null;
};

type Chip = {
  label: string;
  className: string;
};

const formatSpecRate = (value: number | null | undefined): string | null => {
  if (!value || !Number.isFinite(value)) {
    return null;
  }

  if (value < 1000) {
    return `${Math.round(value)}Hz`;
  }

  const khz = value / 1000;
  return `${Number.isInteger(khz) ? Math.round(khz) : khz.toFixed(1)}kHz`;
};

const channelLabel = (channels: number | null | undefined): string | null => {
  if (!channels || !Number.isFinite(channels)) {
    return null;
  }

  if (channels === 1) {
    return 'Mono';
  }

  if (channels === 2) {
    return 'Stereo';
  }

  return `${channels}ch`;
};

const codecClassName = (codec: string): string => {
  if (codec === 'FLAC' || codec === 'ALAC' || codec === 'DSF' || codec === 'DFF') {
    return 'tag-flac';
  }

  return 'tag-lossless';
};

const sourceCodecLabels = new Set(['AIRPLAY', 'DLNA']);

const normalizeDisplayCodec = (codec: string | null): string | null => {
  if (!codec) {
    return null;
  }

  const normalized = codec.trim().toUpperCase();
  return normalized && !sourceCodecLabels.has(normalized) ? normalized : null;
};

const uniqueChips = (chips: Chip[]): Chip[] => {
  const seen = new Set<string>();
  return chips.filter((chip) => {
    if (seen.has(chip.label)) {
      return false;
    }
    seen.add(chip.label);
    return true;
  });
};

const isHiResSource = ({
  bitDepth,
  codec,
  sampleRate,
  track,
}: {
  bitDepth: number | null;
  codec: string | null;
  sampleRate: number | null;
  track: LibraryTrack | null;
}): boolean =>
  isHiResAudioSpec({
    bitDepth,
    codec,
    sampleRate,
    streamingQuality: track?.streamingQuality,
  });

const isDlnaReceiverTrack = (track: LibraryTrack | null): boolean =>
  Boolean(
    track &&
      track.mediaType === 'remote' &&
      track.isTemporary &&
      (track.id.startsWith('dlna-receiver:') || track.fieldSources?.title === 'dlna'),
  );

const isAirPlayReceiverTrack = (track: LibraryTrack | null): boolean =>
  Boolean(
    track &&
      track.mediaType === 'remote' &&
      track.isTemporary &&
      (track.id.startsWith('airplay-receiver:') || track.fieldSources?.title === 'airplay'),
  );

export const PlayerStatusChips = ({ status, state, track }: PlayerStatusChipsProps): JSX.Element => {
  const codec = normalizeDisplayCodec(track?.codec ?? status?.codec ?? null);
  const bitDepth = track?.bitDepth ?? status?.bitDepth ?? null;
  const sampleRate = track?.sampleRate ?? status?.fileSampleRate ?? null;
  const bitrate = track?.bitrate ?? status?.bitrate ?? null;
  const channels = channelLabel(status?.channels);
  const formattedRate = formatSpecRate(sampleRate);
  const playbackRate = status?.playbackRate ?? 1;
  const bpm = isDisplayableBpmAnalysis(track?.bpm, track?.analysisStatus) ? (track?.bpm ?? null) : null;
  const displayBpm = bpm ? Math.round(bpm * playbackRate) : null;
  const chips: Chip[] = uniqueChips([
    status?.sampleRateMismatch ? { label: 'Rate Mismatch', className: 'tag-warning' } : null,
    isDlnaReceiverTrack(track) ? { label: 'DLNA', className: 'tag-dlna' } : null,
    isAirPlayReceiverTrack(track) ? { label: 'AIRPLAY', className: 'tag-airplay' } : null,
    track?.mediaType === 'streaming' ? { label: '流媒体', className: 'tag-streaming' } : null,
    codec ? { label: codec, className: codecClassName(codec) } : null,
    isHiResSource({ bitDepth, codec, sampleRate, track }) ? { label: 'Hi-Res', className: 'tag-hires' } : null,
    bitDepth && formattedRate ? { label: `${bitDepth}bit / ${formattedRate}`, className: 'tag-depth' } : null,
    !bitDepth && formattedRate ? { label: formattedRate, className: 'tag-depth' } : null,
    bitrate ? { label: `${Math.round(bitrate / 1000)}kbps`, className: 'tag-bitrate' } : null,
    displayBpm
      ? {
          label: playbackRate === 1 ? `${displayBpm} BPM` : `${Math.round(bpm!)} BPM -> ${displayBpm} BPM`,
          className: 'tag-bpm',
        }
      : null,
    channels ? { label: channels, className: 'tag-channel' } : null,
  ].filter((chip): chip is Chip => Boolean(chip)));

  if (chips.length === 0) {
    chips.push({ label: state === 'idle' ? 'Ready' : state, className: state === 'error' ? 'tag-warning' : 'tag-depth' });
  }

  return (
    <div className="tag-row player-tags" aria-label="Audio specifications">
      {chips.map((chip) => (
        <span className={`hifi-tag ${chip.className}`} key={chip.label}>
          {chip.label}
        </span>
      ))}
    </div>
  );
};
