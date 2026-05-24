import type { AppSettings, DesktopLyricsBounds } from './appSettings';
import type { AudioStatus } from './audio';

export type DesktopLyricsStylePatch = Partial<Pick<
  AppSettings,
  | 'desktopLyricsFontSizePx'
  | 'desktopLyricsScalePercent'
  | 'desktopLyricsFontFamily'
  | 'desktopLyricsFontFilePath'
  | 'desktopLyricsColor'
  | 'desktopLyricsStrokeColor'
  | 'desktopLyricsOpacityPercent'
>>;

export type DesktopLyricsState = {
  visible: boolean;
  locked: boolean;
  bounds: DesktopLyricsBounds | null;
  settings: Pick<
    AppSettings,
    | 'desktopLyricsEnabled'
    | 'desktopLyricsLocked'
    | 'desktopLyricsFontSizePx'
    | 'desktopLyricsScalePercent'
    | 'desktopLyricsFontFamily'
    | 'desktopLyricsFontFilePath'
    | 'desktopLyricsColor'
    | 'desktopLyricsStrokeColor'
    | 'desktopLyricsOpacityPercent'
    | 'desktopLyricsBounds'
  >;
};

export type DesktopLyricsForwardedAudioStatus = {
  status: AudioStatus;
  receivedAtMs: number;
};
