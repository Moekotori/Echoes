import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd(),
  },
}));

describe('app settings normalization', () => {
  it('keeps old settings files compatible when coverCacheDir is missing', async () => {
    const { normalizeSettings } = await import('./appSettings');
    const settings = normalizeSettings({
      hideToTrayOnClose: true,
      networkMetadataEnabled: true,
      networkMetadataProviders: ['qq-music'],
      playerVolume: 0.5,
      playbackSpeed: 1.25,
      playbackSpeedMode: 'speed',
    });

    expect(settings.coverCacheDir).toBeNull();
    expect(settings.albumMergeStrategy).toBe('standard');
    expect(settings.artistWallAlbumArtwork).toBe(false);
    expect(settings.scanPerformanceMode).toBe('balanced');
    expect(settings.hideToTrayOnClose).toBe(true);
    expect(settings.networkMetadataProviders).toEqual(['qq-music']);
    expect(settings.lyricsNetworkEnabled).toBe(true);
    expect(settings.lyricsEnabledProviders).toEqual(['local', 'lrclib', 'netease', 'qqmusic']);
    expect(settings.lyricsProviderOrder).toEqual(['local', 'lrclib', 'netease', 'qqmusic']);
    expect(settings.lyricsDeepSearchEnabled).toBe(true);
    expect(settings.lyricsAutoSearch).toBe(true);
    expect(settings.lyricsAutoAcceptScore).toBe(0.7);
    expect(settings.lyricsDefaultOffsetMs).toBe(0);
    expect(settings.lyricsEnabled).toBe(true);
    expect(settings.lyricsHeaderHidden).toBe(false);
    expect(settings.lyricsEmptyStateHidden).toBe(true);
    expect(settings.lyricsRomanizationEnabled).toBe(true);
    expect(settings.lyricsFontSizePx).toBe(36);
    expect(settings.lyricsColor).toBe('#314054');
    expect(settings.lyricsBackgroundMode).toBe('theme');
    expect(settings.lyricsCustomWallpaperPath).toBeNull();
    expect(settings.lyricsCoverOpacityPercent).toBe(100);
    expect(settings.lyricsCoverBlurPx).toBe(10);
    expect(settings.lyricsCoverBrightnessPercent).toBe(100);
    expect(settings.lyricsBackgroundScalePercent).toBe(100);
    expect(settings.mvEnabledProviders).toEqual(['bilibili', 'youtube']);
    expect(settings.mvProviderOrder).toEqual(['bilibili', 'youtube']);
    expect(settings.mvAutoSearch).toBe(true);
    expect(settings.mvMaxQuality).toBe('1080p');
    expect(settings.mvAllow60fps).toBe(true);
  });

  it('normalizes an empty coverCacheDir to null', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({ coverCacheDir: '   ' }).coverCacheDir).toBeNull();
  });

  it('resolves a custom coverCacheDir to an absolute path', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({ coverCacheDir: 'relative-cover-cache' }).coverCacheDir).toBe(resolve('relative-cover-cache'));
  });

  it('normalizes albumMergeStrategy values', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).albumMergeStrategy).toBe('standard');
    expect(normalizeSettings({ albumMergeStrategy: 'sameTitleAndCover' }).albumMergeStrategy).toBe('sameTitleAndCover');
    expect(normalizeSettings({ albumMergeStrategy: 'loose' as never }).albumMergeStrategy).toBe('standard');
  });

  it('normalizes artist wall album artwork setting as disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).artistWallAlbumArtwork).toBe(false);
    expect(normalizeSettings({ artistWallAlbumArtwork: 'yes' as never }).artistWallAlbumArtwork).toBe(false);
    expect(normalizeSettings({ artistWallAlbumArtwork: true }).artistWallAlbumArtwork).toBe(true);
  });

  it('keeps Discord Rich Presence disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).discordRichPresenceEnabled).toBe(false);
    expect(normalizeSettings({ discordRichPresenceEnabled: true }).discordRichPresenceEnabled).toBe(true);
    expect(normalizeSettings({ discordRichPresenceEnabled: 'yes' as never }).discordRichPresenceEnabled).toBe(false);
  });

  it('normalizes Last.fm settings with privacy-friendly defaults', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({})).toMatchObject({
      lastFmEnabled: false,
      lastFmUsername: null,
      lastFmSessionKey: null,
      lastFmScrobbleEnabled: true,
      lastFmNowPlayingEnabled: true,
      lastFmMinScrobbleSeconds: 30,
      lastFmAuthToken: null,
    });
    expect(
      normalizeSettings({
        lastFmEnabled: true,
        lastFmUsername: ' alice ',
        lastFmSessionKey: ' session ',
        lastFmScrobbleEnabled: false,
        lastFmNowPlayingEnabled: false,
        lastFmMinScrobbleSeconds: 999,
        lastFmAuthToken: ' token ',
      }),
    ).toMatchObject({
      lastFmEnabled: true,
      lastFmUsername: 'alice',
      lastFmSessionKey: 'session',
      lastFmScrobbleEnabled: false,
      lastFmNowPlayingEnabled: false,
      lastFmMinScrobbleSeconds: 240,
      lastFmAuthToken: 'token',
    });
  });

  it('normalizes scan performance mode', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).scanPerformanceMode).toBe('balanced');
    expect(normalizeSettings({ scanPerformanceMode: 'low' }).scanPerformanceMode).toBe('low');
    expect(normalizeSettings({ scanPerformanceMode: 'performance' }).scanPerformanceMode).toBe('performance');
    expect(normalizeSettings({ scanPerformanceMode: 'turbo' as never }).scanPerformanceMode).toBe('balanced');
  });

  it('normalizes duplicate track settings conservatively', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).duplicateTracksEnabled).toBe(false);
    expect(normalizeSettings({ duplicateTracksEnabled: true }).duplicateTracksEnabled).toBe(true);
    expect(normalizeSettings({ duplicateTracksMode: 'aggressive' }).duplicateTracksMode).toBe('strict');
    expect(normalizeSettings({ duplicateTracksAutoRebuildAfterScan: true }).duplicateTracksAutoRebuildAfterScan).toBe(true);
  });

  it('normalizes lyrics settings', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(
      normalizeSettings({
        lyricsNetworkEnabled: false,
        lyricsEnabledProviders: ['local', 'qqmusic', 'bad-provider'] as never,
        lyricsProviderOrder: ['qqmusic', 'lrclib', 'bad-provider'] as never,
        lyricsProviderTimeoutMs: 50,
        lyricsTotalMatchTimeoutMs: 99999,
        lyricsCoverAutoAcceptScore: 2,
        lyricsDeepSearchEnabled: false,
        lyricsAutoSearch: false,
        lyricsAutoAcceptScore: 2,
        lyricsDefaultOffsetMs: -24000,
        lyricsEnabled: false,
        lyricsHeaderHidden: true,
        lyricsEmptyStateHidden: false,
        lyricsRomanizationEnabled: false,
        lyricsFontSizePx: 999,
        lyricsColor: 'red',
        lyricsBackgroundMode: 'album' as never,
        lyricsCustomWallpaperPath: 'D:\\Outside\\wallpaper.png',
        lyricsCoverOpacityPercent: -10,
        lyricsCoverBlurPx: 999,
        lyricsCoverBrightnessPercent: 12,
        lyricsBackgroundScalePercent: 999,
      }),
    ).toMatchObject({
      lyricsNetworkEnabled: false,
      lyricsPreferredProvider: 'lrclib',
      lyricsEnabledProviders: ['local', 'qqmusic'],
      lyricsProviderOrder: ['qqmusic', 'lrclib', 'local', 'netease'],
      lyricsProviderTimeoutMs: 1000,
      lyricsTotalMatchTimeoutMs: 15000,
      lyricsCoverAutoAcceptScore: 1,
      lyricsDeepSearchEnabled: false,
      lyricsAutoSearch: false,
      lyricsAutoAcceptScore: 0.7,
      lyricsDefaultOffsetMs: -10000,
      lyricsEnabled: false,
      lyricsHeaderHidden: true,
      lyricsEmptyStateHidden: false,
      lyricsRomanizationEnabled: false,
      lyricsFontSizePx: 56,
      lyricsColor: '#314054',
      lyricsBackgroundMode: 'theme',
      lyricsCustomWallpaperPath: null,
      lyricsCoverOpacityPercent: 0,
      lyricsCoverBlurPx: 60,
      lyricsCoverBrightnessPercent: 40,
      lyricsBackgroundScalePercent: 180,
    });

    expect(
      normalizeSettings({
        lyricsFontSizePx: 12,
        lyricsColor: '#ff3366',
        lyricsBackgroundMode: 'cover',
        lyricsCoverOpacityPercent: 64.4,
        lyricsCoverBlurPx: 12.5,
        lyricsCoverBrightnessPercent: 118.6,
        lyricsBackgroundScalePercent: 55,
      }),
    ).toMatchObject({
      lyricsFontSizePx: 22,
      lyricsColor: '#FF3366',
      lyricsBackgroundMode: 'cover',
      lyricsCoverOpacityPercent: 64,
      lyricsCoverBlurPx: 13,
      lyricsCoverBrightnessPercent: 119,
      lyricsBackgroundScalePercent: 70,
      lyricsRomanizationEnabled: true,
    });
  });

  it('normalizes channel balance settings for old and malformed settings files', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).channelBalance).toMatchObject({
      enabled: false,
      balance: 0,
      leftGainDb: 0,
      rightGainDb: 0,
      monoMode: 'off',
      constantPower: true,
    });

    expect(
      normalizeSettings({
        channelBalance: {
          enabled: true,
          balance: -5,
          leftGainDb: -99,
          rightGainDb: 99,
          monoMode: 'right',
          invertLeft: true,
          constantPower: false,
        },
      }).channelBalance,
    ).toMatchObject({
      enabled: true,
      balance: -1,
      leftGainDb: -12,
      rightGainDb: 6,
      monoMode: 'right',
      invertLeft: true,
      constantPower: false,
    });
  });

  it('normalizes MV network settings', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(
      normalizeSettings({
        mvEnabledProviders: ['youtube', 'qqmusic', 'youtube'] as never,
        mvProviderOrder: ['youtube'] as never,
        mvAutoSearch: false,
        mvMaxQuality: 'max',
        mvAllow60fps: false,
      }),
    ).toMatchObject({
      mvEnabledProviders: ['youtube'],
      mvProviderOrder: ['youtube', 'bilibili'],
      mvAutoSearch: false,
      mvMaxQuality: 'max',
      mvAllow60fps: false,
    });

    expect(
      normalizeSettings({
        mvMaxQuality: '8k' as never,
      }),
    ).toMatchObject({
      mvAutoSearch: true,
      mvMaxQuality: '1080p',
      mvAllow60fps: true,
    });
  });
});
