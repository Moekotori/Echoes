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
    expect(settings.appearanceTheme).toBe('dark');
    expect(settings.appearanceThemePreset).toBe('classic');
    expect(settings.appearanceThemePresetOverrides).toEqual({});
    expect(settings.albumMergeStrategy).toBe('standard');
    expect(settings.chineseCrossScriptSearchEnabled).toBe(true);
    expect(settings.artistWallAlbumArtwork).toBe(false);
    expect(settings.artistWallAlbumFallbackForMissingAvatars).toBe(false);
    expect(settings.autoFetchArtistImages).toBe(false);
    expect(settings.artistImageFetchPaused).toBe(false);
    expect(settings.autoAccountCheckOnStartup).toBe(true);
    expect(settings.spotifyAutoLaunchOfficialPlayer).toBe(true);
    expect(settings.playlistBackupsEnabled).toBe(true);
    expect(settings.rememberWindowSizeEnabled).toBe(true);
    expect(settings.rememberedWindowSize).toBeNull();
    expect(settings.appCustomWallpaperPath).toBeNull();
    expect(settings.appWallpaperScalePercent).toBe(100);
    expect(settings.appWallpaperBlurPx).toBe(0);
    expect(settings.appWallpaperBrightnessPercent).toBe(100);
    expect(settings.appWallpaperUiOpacityPercent).toBe(100);
    expect(settings.appWallpaperVisualProtectionEnabled).toBe(true);
    expect(settings.appWallpaperUnifiedOpacityEnabled).toBe(false);
    expect(settings.scanPerformanceMode).toBe('balanced');
    expect(settings.backgroundSpacePauseEnabled).toBe(false);
    expect(settings.globalShortcuts?.playPause).toEqual({ enabled: false, accelerator: null });
    expect(settings.globalShortcuts?.nextTrack).toEqual({ enabled: false, accelerator: null });
    expect(settings.playbackFollowCurrentTrack).toBe(false);
    expect(settings.hideToTrayOnClose).toBe(true);
    expect(settings.networkMetadataProviders).toEqual(['qq-music']);
    expect(settings.audioAnalysisEnabled).toBe(true);
    expect(settings.lyricsNetworkEnabled).toBe(true);
    expect(settings.lyricsEnabledProviders).toEqual(['local', 'lrclib', 'netease', 'qqmusic']);
    expect(settings.lyricsProviderOrder).toEqual(['local', 'lrclib', 'netease', 'qqmusic']);
    expect(settings.lyricsDeepSearchEnabled).toBe(true);
    expect(settings.lyricsAutoSearch).toBe(true);
    expect(settings.lyricsAutoAcceptScore).toBe(0.5);
    expect(settings.lyricsDefaultOffsetMs).toBe(0);
    expect(settings.lyricsGlobalSyncOffsetMs).toBe(0);
    expect(settings.lyricsOffsetControlsEnabled).toBe(false);
    expect(settings.lyricsEnabled).toBe(true);
    expect(settings.lyricsHeaderHidden).toBe(false);
    expect(settings.lyricsMvAutoShowTrackInfoDisabled).toBe(true);
    expect(settings.lyricsEmptyStateHidden).toBe(true);
    expect(settings.lyricsPlayerBarDrawerEnabled).toBe(false);
    expect(settings.lyricsPlayerBarDrawerOpacityPercent).toBe(78);
    expect(settings.lyricsPlayerBarDrawerColorMode).toBe('default');
    expect(settings.lyricsPlayerBarDrawerColor).toBe('#232120');
    expect(settings.lyricsRomanizationEnabled).toBe(true);
    expect(settings.lyricsTranslationEnabled).toBe(true);
    expect(settings.lyricsWordHighlightEnabled).toBe(true);
    expect(settings.lyricsFontSizePx).toBe(40);
    expect(settings.lyricsSecondaryFontSizePx).toBe(22);
    expect(settings.lyricsLineSpacingPercent).toBe(110);
    expect(settings.lyricsLineMaxChars).toBe(0);
    expect(settings.lyricsContextOpacityPercent).toBe(49);
    expect(settings.lyricsColor).toBe('#314054');
    expect(settings.lyricsSmartReadableColorsEnabled).toBe(false);
    expect(settings.lyricsHighResolutionNetworkCoverEnabled).toBe(false);
    expect(settings.lyricsBackgroundMode).toBe('theme');
    expect(settings.lyricsCustomWallpaperPath).toBeNull();
    expect(settings.lyricsCoverOpacityPercent).toBe(100);
    expect(settings.lyricsCoverBlurPx).toBe(10);
    expect(settings.lyricsCoverBrightnessPercent).toBe(100);
    expect(settings.lyricsBackgroundScalePercent).toBe(100);
    expect(settings.mvEnabled).toBe(true);
    expect(settings.mvEnabledProviders).toEqual(['bilibili', 'youtube']);
    expect(settings.mvProviderOrder).toEqual(['bilibili', 'youtube']);
    expect(settings.mvAutoSearch).toBe(true);
    expect(settings.mvAutoApplyThreshold).toBe(0.7);
    expect(settings.mvImmersiveBackground).toBe(true);
    expect(settings.mvImmersiveBackgroundScalePercent).toBe(115);
    expect(settings.mvImmersiveBackgroundOffsetXPercent).toBe(50);
    expect(settings.mvImmersiveBackgroundOffsetYPercent).toBe(50);
    expect(settings.mvImmersiveBackgroundBlurPx).toBe(0);
    expect(settings.mvImmersiveBackgroundBrightnessPercent).toBe(100);
    expect(settings.mvImmersiveBackgroundOverlayOpacityPercent).toBe(0);
    expect(settings.mvLyricsReadabilityEnhanced).toBe(false);
    expect(settings.mvMaxQuality).toBe('max');
    expect(settings.mvAllow60fps).toBe(true);
  });

  it('normalizes an empty coverCacheDir to null', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({ coverCacheDir: '   ' }).coverCacheDir).toBeNull();
  });

  it('normalizes appearance theme modes', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).appearanceTheme).toBe('dark');
    expect(normalizeSettings({ appearanceTheme: 'dark' }).appearanceTheme).toBe('dark');
    expect(normalizeSettings({ appearanceTheme: 'system' }).appearanceTheme).toBe('system');
    expect(normalizeSettings({ appearanceTheme: 'midnight' as never }).appearanceTheme).toBe('dark');
  });

  it('normalizes appearance theme presets', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).appearanceThemePreset).toBe('classic');
    expect(normalizeSettings({ appearanceThemePreset: 'echoTwilight' }).appearanceThemePreset).toBe('echoTwilight');
    expect(normalizeSettings({ appearanceThemePreset: 'sakuraMilk' }).appearanceThemePreset).toBe('sakuraMilk');
    expect(normalizeSettings({ appearanceThemePreset: 'lemonMochi' }).appearanceThemePreset).toBe('lemonMochi');
    expect(normalizeSettings({ appearanceThemePreset: 'seaSaltJelly' }).appearanceThemePreset).toBe('seaSaltJelly');
    expect(normalizeSettings({ appearanceThemePreset: 'caramelPudding' }).appearanceThemePreset).toBe('caramelPudding');
    expect(normalizeSettings({ appearanceThemePreset: 'neonCandy' }).appearanceThemePreset).toBe('neonCandy');
    expect(normalizeSettings({ appearanceThemePreset: 'nyanCat' }).appearanceThemePreset).toBe('nyanCat');
    expect(normalizeSettings({ appearanceThemePreset: 'wisteriaBubble' }).appearanceThemePreset).toBe('wisteriaBubble');
    expect(normalizeSettings({ appearanceThemePreset: 'strawberryCookie' }).appearanceThemePreset).toBe('strawberryCookie');
    expect(normalizeSettings({ appearanceThemePreset: 'graphiteAurora' }).appearanceThemePreset).toBe('graphiteAurora');
    expect(normalizeSettings({ appearanceThemePreset: 'amberNoir' }).appearanceThemePreset).toBe('amberNoir');
    expect(normalizeSettings({ appearanceThemePreset: 'oceanStudio' }).appearanceThemePreset).toBe('oceanStudio');
    expect(normalizeSettings({ appearanceThemePreset: 'rosewoodVinyl' }).appearanceThemePreset).toBe('rosewoodVinyl');
    expect(normalizeSettings({ appearanceThemePreset: 'darkSideMoon' }).appearanceThemePreset).toBe('darkSideMoon');
    expect(normalizeSettings({ appearanceThemePreset: 'shibuyaNight' }).appearanceThemePreset).toBe('shibuyaNight');
    expect(normalizeSettings({ appearanceThemePreset: 'kyotoKurenai' }).appearanceThemePreset).toBe('kyotoKurenai');
    expect(normalizeSettings({ appearanceThemePreset: 'ukiyoIndigo' }).appearanceThemePreset).toBe('ukiyoIndigo');
    expect(normalizeSettings({ appearanceThemePreset: 'fujiSnow' }).appearanceThemePreset).toBe('fujiSnow');
    expect(normalizeSettings({ appearanceThemePreset: 'matsuriLantern' }).appearanceThemePreset).toBe('matsuriLantern');
    expect(normalizeSettings({ appearanceThemePreset: 'ginzaNoir' }).appearanceThemePreset).toBe('ginzaNoir');
    expect(normalizeSettings({ appearanceThemePreset: 'frostJazz' }).appearanceThemePreset).toBe('frostJazz');
    expect(normalizeSettings({ appearanceThemePreset: 'midnight' as never }).appearanceThemePreset).toBe('classic');
  });

  it('normalizes appearance theme preset overrides', async () => {
    const { normalizeSettings } = await import('./appSettings');

    const normalized = normalizeSettings({
      appearanceThemePresetOverrides: {
        echoTwilight: {
          light: {
            appBg: '#FFF4EF',
            accent: '#df6b5f',
            panel: 'not-a-color',
            panelOpacityPercent: 10,
            glassPercent: 120,
            shadowPercent: 44.4,
          },
          dark: {
            text: '#F3E3DE',
            onAccent: '#2b1513',
          },
        },
        unknownPreset: {
          light: {
            appBg: '#000000',
          },
        },
        lemonMochi: {
          light: {
            border: '#c99a26',
            buttonText: '#332a10',
          },
        },
      },
    } as never);

    expect(normalized.appearanceThemePresetOverrides).toEqual({
      echoTwilight: {
        light: {
          appBg: '#fff4ef',
          accent: '#df6b5f',
          panelOpacityPercent: 40,
          glassPercent: 80,
          shadowPercent: 44,
        },
        dark: {
          text: '#f3e3de',
          onAccent: '#2b1513',
        },
      },
      lemonMochi: {
        light: {
          border: '#c99a26',
          buttonText: '#332a10',
        },
      },
    });
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

  it('keeps Chinese cross-script search enabled unless explicitly disabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).chineseCrossScriptSearchEnabled).toBe(true);
    expect(normalizeSettings({ chineseCrossScriptSearchEnabled: true }).chineseCrossScriptSearchEnabled).toBe(true);
    expect(normalizeSettings({ chineseCrossScriptSearchEnabled: false }).chineseCrossScriptSearchEnabled).toBe(false);
    expect(normalizeSettings({ chineseCrossScriptSearchEnabled: 'no' as never }).chineseCrossScriptSearchEnabled).toBe(true);
  });

  it('normalizes artist wall album artwork setting as disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).artistWallAlbumArtwork).toBe(false);
    expect(normalizeSettings({ artistWallAlbumArtwork: 'yes' as never }).artistWallAlbumArtwork).toBe(false);
    expect(normalizeSettings({ artistWallAlbumArtwork: true }).artistWallAlbumArtwork).toBe(true);
  });

  it('normalizes artist wall missing-avatar fallback as disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).artistWallAlbumFallbackForMissingAvatars).toBe(false);
    expect(normalizeSettings({ artistWallAlbumFallbackForMissingAvatars: 'yes' as never }).artistWallAlbumFallbackForMissingAvatars).toBe(false);
    expect(normalizeSettings({ artistWallAlbumFallbackForMissingAvatars: true }).artistWallAlbumFallbackForMissingAvatars).toBe(true);
  });

  it('normalizes automatic artist image fetching as disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).autoFetchArtistImages).toBe(false);
    expect(normalizeSettings({ autoFetchArtistImages: 'yes' as never }).autoFetchArtistImages).toBe(false);
    expect(normalizeSettings({ autoFetchArtistImages: true }).autoFetchArtistImages).toBe(true);
  });

  it('normalizes artist image fetching pause as disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).artistImageFetchPaused).toBe(false);
    expect(normalizeSettings({ artistImageFetchPaused: 'yes' as never }).artistImageFetchPaused).toBe(false);
    expect(normalizeSettings({ artistImageFetchPaused: true }).artistImageFetchPaused).toBe(true);
  });

  it('keeps playlist backups enabled unless explicitly disabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).playlistBackupsEnabled).toBe(true);
    expect(normalizeSettings({ playlistBackupsEnabled: true }).playlistBackupsEnabled).toBe(true);
    expect(normalizeSettings({ playlistBackupsEnabled: false }).playlistBackupsEnabled).toBe(false);
    expect(normalizeSettings({ playlistBackupsEnabled: 'no' as never }).playlistBackupsEnabled).toBe(true);
  });

  it('keeps startup account checks enabled unless explicitly disabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).autoAccountCheckOnStartup).toBe(true);
    expect(normalizeSettings({ autoAccountCheckOnStartup: true }).autoAccountCheckOnStartup).toBe(true);
    expect(normalizeSettings({ autoAccountCheckOnStartup: false }).autoAccountCheckOnStartup).toBe(false);
    expect(normalizeSettings({ autoAccountCheckOnStartup: 'no' as never }).autoAccountCheckOnStartup).toBe(true);
  });

  it('keeps Spotify official player auto launch enabled unless explicitly disabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).spotifyAutoLaunchOfficialPlayer).toBe(true);
    expect(normalizeSettings({ spotifyAutoLaunchOfficialPlayer: true }).spotifyAutoLaunchOfficialPlayer).toBe(true);
    expect(normalizeSettings({ spotifyAutoLaunchOfficialPlayer: false }).spotifyAutoLaunchOfficialPlayer).toBe(false);
    expect(normalizeSettings({ spotifyAutoLaunchOfficialPlayer: 'no' as never }).spotifyAutoLaunchOfficialPlayer).toBe(true);
  });

  it('normalizes remembered window size settings', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).rememberWindowSizeEnabled).toBe(true);
    expect(normalizeSettings({ rememberWindowSizeEnabled: false }).rememberWindowSizeEnabled).toBe(false);
    expect(normalizeSettings({ rememberWindowSizeEnabled: 'no' as never }).rememberWindowSizeEnabled).toBe(true);
    expect(normalizeSettings({ rememberedWindowSize: { width: 1280.4, height: 720.6 } }).rememberedWindowSize).toEqual({
      width: 1280,
      height: 721,
    });
    expect(normalizeSettings({ rememberedWindowSize: { width: 100, height: 100 } }).rememberedWindowSize).toEqual({
      width: 360,
      height: 620,
    });
    expect(normalizeSettings({ rememberedWindowSize: { width: 'wide', height: 720 } as never }).rememberedWindowSize).toBeNull();
  });

  it('normalizes app wallpaper settings without accepting unsafe paths', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(
      normalizeSettings({
        appCustomWallpaperPath: 'D:\\Outside\\wallpaper.png',
        appWallpaperScalePercent: 999,
        appWallpaperBlurPx: 99,
        appWallpaperBrightnessPercent: 12,
        appWallpaperUiOpacityPercent: -10,
        appWallpaperVisualProtectionEnabled: false,
        appWallpaperUnifiedOpacityEnabled: true,
      }),
    ).toMatchObject({
      appCustomWallpaperPath: null,
      appWallpaperScalePercent: 220,
      appWallpaperBlurPx: 40,
      appWallpaperBrightnessPercent: 40,
      appWallpaperUiOpacityPercent: 0,
      appWallpaperVisualProtectionEnabled: false,
      appWallpaperUnifiedOpacityEnabled: true,
    });

    expect(
      normalizeSettings({
        appWallpaperScalePercent: 80,
        appWallpaperBlurPx: -4,
        appWallpaperBrightnessPercent: 180,
        appWallpaperUiOpacityPercent: 128,
        appWallpaperVisualProtectionEnabled: 'yes' as never,
        appWallpaperUnifiedOpacityEnabled: 'yes' as never,
      }),
    ).toMatchObject({
      appWallpaperScalePercent: 100,
      appWallpaperBlurPx: 0,
      appWallpaperBrightnessPercent: 140,
      appWallpaperUiOpacityPercent: 100,
      appWallpaperVisualProtectionEnabled: true,
      appWallpaperUnifiedOpacityEnabled: false,
    });
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

  it('normalizes the playback follow-current-track setting as opt-in', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).playbackFollowCurrentTrack).toBe(false);
    expect(normalizeSettings({ playbackFollowCurrentTrack: true }).playbackFollowCurrentTrack).toBe(true);
    expect(normalizeSettings({ playbackFollowCurrentTrack: 'yes' as never }).playbackFollowCurrentTrack).toBe(false);
  });

  it('migrates the legacy background space pause setting to disabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).backgroundSpacePauseEnabled).toBe(false);
    expect(normalizeSettings({ backgroundSpacePauseEnabled: true }).backgroundSpacePauseEnabled).toBe(false);
    expect(normalizeSettings({ backgroundSpacePauseEnabled: 'yes' as never }).backgroundSpacePauseEnabled).toBe(false);
  });

  it('normalizes global shortcut settings as disabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    const shortcuts = normalizeSettings({}).globalShortcuts;

    expect(shortcuts?.playPause).toEqual({ enabled: false, accelerator: null });
    expect(shortcuts?.previousTrack).toEqual({ enabled: false, accelerator: null });
    expect(shortcuts?.showMainWindow).toEqual({ enabled: false, accelerator: null });
  });

  it('keeps valid global shortcuts and removes invalid or duplicate bindings', async () => {
    const { normalizeSettings } = await import('./appSettings');

    const shortcuts = normalizeSettings({
      globalShortcuts: {
        playPause: { enabled: true, accelerator: 'ctrl + alt + space' },
        previousTrack: { enabled: true, accelerator: 'Space' },
        nextTrack: { enabled: true, accelerator: 'Ctrl+Alt+Space' },
        stop: { enabled: true, accelerator: 'MediaStop' },
        volumeUp: { enabled: true, accelerator: 'F13' },
        volumeDown: { enabled: true, accelerator: 'MouseButton4' },
        seekBackward: { enabled: true, accelerator: 'Ctrl+Alt+???' },
      },
    }).globalShortcuts;

    expect(shortcuts?.playPause).toEqual({ enabled: true, accelerator: 'Ctrl+Alt+Space' });
    expect(shortcuts?.previousTrack).toEqual({ enabled: true, accelerator: 'Space' });
    expect(shortcuts?.nextTrack).toEqual({ enabled: false, accelerator: null });
    expect(shortcuts?.stop).toEqual({ enabled: true, accelerator: 'MediaStop' });
    expect(shortcuts?.volumeUp).toEqual({ enabled: true, accelerator: 'F13' });
    expect(shortcuts?.volumeDown).toEqual({ enabled: true, accelerator: 'MouseButton4' });
    expect(shortcuts?.seekBackward).toEqual({ enabled: false, accelerator: null });
  });

  it('preserves valid remembered audio output latency profiles', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(
      normalizeSettings({
        rememberedAudioOutput: { enabled: true, outputMode: 'asio', latencyProfile: 'balanced' },
      }).rememberedAudioOutput,
    ).toMatchObject({
      enabled: true,
      outputMode: 'asio',
      latencyProfile: 'balanced',
    });
    expect(
      normalizeSettings({
        rememberedAudioOutput: { enabled: true, outputMode: 'shared', sharedBackend: 'directsound', latencyProfile: 'stable' },
      }).rememberedAudioOutput,
    ).toMatchObject({
      enabled: true,
      outputMode: 'shared',
      sharedBackend: 'directsound',
      latencyProfile: 'stable',
    });
    expect(
      normalizeSettings({
        rememberedAudioOutput: { enabled: true, outputMode: 'shared', sharedBackend: 'invalid' as never },
      }).rememberedAudioOutput?.sharedBackend,
    ).toBe('auto');
  });

  it('sanitizes incompatible remembered low-latency buffer sizes', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(
      normalizeSettings({
        rememberedAudioOutput: {
          enabled: true,
          outputMode: 'shared',
          latencyProfile: 'lowLatency',
          bufferSizeFrames: 8192,
        },
      }).rememberedAudioOutput,
    ).not.toHaveProperty('bufferSizeFrames');
    expect(
      normalizeSettings({
        rememberedAudioOutput: {
          enabled: true,
          outputMode: 'asio',
          latencyProfile: 'lowLatency',
          bufferSizeFrames: 8192,
        },
      }).rememberedAudioOutput?.bufferSizeFrames,
    ).toBe(2048);
    expect(
      normalizeSettings({
        rememberedAudioOutput: {
          enabled: true,
          outputMode: 'shared',
          latencyProfile: 'stable',
          bufferSizeFrames: 8192,
        },
      }).rememberedAudioOutput?.bufferSizeFrames,
    ).toBe(8192);
  });

  it('normalizes JUCE output as the default main audio output', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioUseJuceOutput).toBe(true);
    expect(normalizeSettings({ audioUseJuceOutput: true }).audioUseJuceOutput).toBe(true);
    expect(normalizeSettings({ appMemoryVersion: 2, audioUseJuceOutput: false }).audioUseJuceOutput).toBe(false);
    expect(normalizeSettings({ appMemoryVersion: 2, audioUseJuceOutput: 'yes' as never }).audioUseJuceOutput).toBe(true);
  });

  it('migrates older settings to JUCE main output once', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({ appMemoryVersion: 1, audioUseJuceOutput: false }).audioUseJuceOutput).toBe(true);
    expect(normalizeSettings({ appMemoryVersion: 1, audioUseJuceOutput: false }).appMemoryVersion).toBe(2);
  });

  it('keeps JUCE decode disabled until explicitly enabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioUseJuceDecode).toBe(false);
    expect(normalizeSettings({ audioUseJuceDecode: true }).audioUseJuceDecode).toBe(true);
    expect(normalizeSettings({ audioUseJuceDecode: false }).audioUseJuceDecode).toBe(false);
    expect(normalizeSettings({ audioUseJuceDecode: 'yes' as never }).audioUseJuceDecode).toBe(false);
    expect(normalizeSettings({ appMemoryVersion: 1, audioUseJuceDecode: true }).audioUseJuceDecode).toBe(true);
  });

  it('normalizes ASIO unavailable fallback as an opt-in audio setting', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioAsioUnavailableFallbackEnabled).toBe(false);
    expect(normalizeSettings({ audioAsioUnavailableFallbackEnabled: true }).audioAsioUnavailableFallbackEnabled).toBe(true);
    expect(normalizeSettings({ audioAsioUnavailableFallbackEnabled: false }).audioAsioUnavailableFallbackEnabled).toBe(false);
    expect(normalizeSettings({ audioAsioUnavailableFallbackEnabled: 'yes' as never }).audioAsioUnavailableFallbackEnabled).toBe(false);
  });

  it('keeps ASIO native DSD experiment disabled until explicitly enabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioAsioNativeDsdExperimentalEnabled).toBe(false);
    expect(normalizeSettings({ audioAsioNativeDsdExperimentalEnabled: true }).audioAsioNativeDsdExperimentalEnabled).toBe(true);
    expect(normalizeSettings({ audioAsioNativeDsdExperimentalEnabled: false }).audioAsioNativeDsdExperimentalEnabled).toBe(false);
    expect(normalizeSettings({ audioAsioNativeDsdExperimentalEnabled: 'yes' as never }).audioAsioNativeDsdExperimentalEnabled).toBe(false);
  });

  it('keeps SOXR fallback enabled by default for stable playback', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioSoxrFallbackEnabled).toBe(true);
    expect(normalizeSettings({ audioSoxrFallbackEnabled: true }).audioSoxrFallbackEnabled).toBe(true);
    expect(normalizeSettings({ audioSoxrFallbackEnabled: false }).audioSoxrFallbackEnabled).toBe(false);
    expect(normalizeSettings({ audioSoxrFallbackEnabled: 'yes' as never }).audioSoxrFallbackEnabled).toBe(true);
  });

  it('keeps release-exclusive-on-pause experiment disabled until explicitly enabled', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioReleaseExclusiveOnPauseExperimentalEnabled).toBe(false);
    expect(normalizeSettings({ audioReleaseExclusiveOnPauseExperimentalEnabled: true }).audioReleaseExclusiveOnPauseExperimentalEnabled).toBe(true);
    expect(normalizeSettings({ audioReleaseExclusiveOnPauseExperimentalEnabled: false }).audioReleaseExclusiveOnPauseExperimentalEnabled).toBe(false);
    expect(normalizeSettings({ audioReleaseExclusiveOnPauseExperimentalEnabled: 'yes' as never }).audioReleaseExclusiveOnPauseExperimentalEnabled).toBe(false);
  });

  it('keeps audio analysis enabled by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).audioAnalysisEnabled).toBe(true);
    expect(normalizeSettings({ audioAnalysisEnabled: false }).audioAnalysisEnabled).toBe(false);
    expect(normalizeSettings({ audioAnalysisEnabled: true }).audioAnalysisEnabled).toBe(true);
    expect(normalizeSettings({ audioAnalysisEnabled: 'yes' as never }).audioAnalysisEnabled).toBe(true);
  });

  it('keeps ReplayGain analysis lazy by default', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).replayGainAnalyzeOnPlay).toBe(true);
    expect(normalizeSettings({}).replayGainAnalyzeMissingOnScan).toBe(false);
    expect(normalizeSettings({ replayGainAnalyzeOnPlay: false }).replayGainAnalyzeOnPlay).toBe(false);
    expect(normalizeSettings({ replayGainAnalyzeMissingOnScan: true }).replayGainAnalyzeMissingOnScan).toBe(false);
    expect(normalizeSettings({
      replayGainAnalyzeMissingOnScan: true,
      replayGainAnalyzeMissingOnScanOptIn: true,
    }).replayGainAnalyzeMissingOnScan).toBe(true);
    expect(normalizeSettings({ replayGainAnalyzeMissingOnScan: 'yes' as never }).replayGainAnalyzeMissingOnScan).toBe(false);
  });

  it('normalizes duplicate track settings conservatively', async () => {
    const { normalizeSettings } = await import('./appSettings');

    expect(normalizeSettings({}).duplicateTracksEnabled).toBe(true);
    expect(normalizeSettings({ duplicateTracksEnabled: false }).duplicateTracksEnabled).toBe(false);
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
        lyricsGlobalSyncOffsetMs: 24000,
        lyricsOffsetControlsEnabled: true,
        lyricsEnabled: false,
        lyricsHeaderHidden: true,
        lyricsMvAutoShowTrackInfoDisabled: false,
        lyricsEmptyStateHidden: false,
        lyricsPlayerBarDrawerEnabled: true,
        lyricsPlayerBarDrawerOpacityPercent: 500,
        lyricsPlayerBarDrawerColorMode: 'neon' as never,
        lyricsPlayerBarDrawerColor: 'red',
        lyricsRomanizationEnabled: false,
        lyricsTranslationEnabled: false,
        lyricsWordHighlightEnabled: false,
        lyricsFontSizePx: 999,
        lyricsLineSpacingPercent: 999,
        lyricsLineMaxChars: 999,
        lyricsContextOpacityPercent: 1000,
        lyricsColor: 'red',
        lyricsSmartReadableColorsEnabled: 'yes' as never,
        lyricsHighResolutionNetworkCoverEnabled: 'yes' as never,
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
      lyricsAutoAcceptScore: 1,
      lyricsDefaultOffsetMs: -10000,
      lyricsGlobalSyncOffsetMs: 1000,
      lyricsOffsetControlsEnabled: true,
      lyricsEnabled: false,
      lyricsHeaderHidden: true,
      lyricsMvAutoShowTrackInfoDisabled: false,
      lyricsEmptyStateHidden: false,
      lyricsPlayerBarDrawerEnabled: true,
      lyricsPlayerBarDrawerOpacityPercent: 100,
      lyricsPlayerBarDrawerColorMode: 'default',
      lyricsPlayerBarDrawerColor: '#232120',
      lyricsRomanizationEnabled: false,
      lyricsTranslationEnabled: false,
      lyricsWordHighlightEnabled: false,
      lyricsFontSizePx: 56,
      lyricsLineSpacingPercent: 150,
      lyricsLineMaxChars: 80,
      lyricsContextOpacityPercent: 100,
      lyricsColor: '#314054',
      lyricsSmartReadableColorsEnabled: false,
      lyricsHighResolutionNetworkCoverEnabled: false,
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
        lyricsLineSpacingPercent: 20,
        lyricsLineMaxChars: -1,
        lyricsAutoAcceptScore: 0.1,
        lyricsContextOpacityPercent: 64.4,
        lyricsPlayerBarDrawerOpacityPercent: 12,
        lyricsPlayerBarDrawerColorMode: 'cover',
        lyricsPlayerBarDrawerColor: '#ff8a80',
        lyricsColor: '#ff3366',
        lyricsSmartReadableColorsEnabled: true,
        lyricsHighResolutionNetworkCoverEnabled: true,
        lyricsBackgroundMode: 'cover',
        lyricsCoverOpacityPercent: 64.4,
        lyricsCoverBlurPx: 12.5,
        lyricsCoverBrightnessPercent: 118.6,
        lyricsBackgroundScalePercent: 55,
      }),
    ).toMatchObject({
      lyricsFontSizePx: 22,
      lyricsLineSpacingPercent: 60,
      lyricsLineMaxChars: 0,
      lyricsAutoAcceptScore: 0.3,
      lyricsContextOpacityPercent: 64,
      lyricsPlayerBarDrawerOpacityPercent: 20,
      lyricsPlayerBarDrawerColorMode: 'cover',
      lyricsPlayerBarDrawerColor: '#FF8A80',
      lyricsColor: '#FF3366',
      lyricsSmartReadableColorsEnabled: true,
      lyricsHighResolutionNetworkCoverEnabled: true,
      lyricsBackgroundMode: 'cover',
      lyricsCoverOpacityPercent: 64,
      lyricsCoverBlurPx: 13,
      lyricsCoverBrightnessPercent: 119,
      lyricsBackgroundScalePercent: 70,
      lyricsRomanizationEnabled: true,
      lyricsTranslationEnabled: true,
      lyricsWordHighlightEnabled: true,
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
        mvEnabled: false,
        mvProviderOrder: ['youtube'] as never,
        mvAutoSearch: false,
        mvAutoApplyThreshold: 0.82,
        mvImmersiveBackground: false,
        mvImmersiveBackgroundScalePercent: 180,
        mvImmersiveBackgroundOffsetXPercent: 18,
        mvImmersiveBackgroundOffsetYPercent: 76,
        mvImmersiveBackgroundBlurPx: 12,
        mvImmersiveBackgroundBrightnessPercent: 118,
        mvImmersiveBackgroundOverlayOpacityPercent: 42,
        mvLyricsReadabilityEnhanced: true,
        mvReplayAudioOnChange: false,
        mvMaxQuality: 'max',
        mvAllow60fps: false,
      }),
    ).toMatchObject({
      mvEnabledProviders: ['youtube'],
      mvEnabled: false,
      mvProviderOrder: ['youtube', 'bilibili'],
      mvAutoSearch: false,
      mvAutoApplyThreshold: 0.82,
      mvImmersiveBackground: false,
      mvImmersiveBackgroundScalePercent: 180,
      mvImmersiveBackgroundOffsetXPercent: 18,
      mvImmersiveBackgroundOffsetYPercent: 76,
      mvImmersiveBackgroundBlurPx: 12,
      mvImmersiveBackgroundBrightnessPercent: 118,
      mvImmersiveBackgroundOverlayOpacityPercent: 42,
      mvLyricsReadabilityEnhanced: true,
      mvReplayAudioOnChange: false,
      mvMaxQuality: 'max',
      mvAllow60fps: false,
    });

    expect(
      normalizeSettings({
        mvAutoApplyThreshold: 0.1,
        mvMaxQuality: '8k' as never,
        mvImmersiveBackgroundScalePercent: 999,
        mvImmersiveBackgroundOffsetXPercent: -10,
        mvImmersiveBackgroundOffsetYPercent: 140,
        mvImmersiveBackgroundBlurPx: 99,
        mvImmersiveBackgroundBrightnessPercent: 12,
        mvImmersiveBackgroundOverlayOpacityPercent: -10,
        mvLyricsReadabilityEnhanced: 'yes' as never,
      }),
    ).toMatchObject({
      mvAutoSearch: true,
      mvAutoApplyThreshold: 0.3,
      mvImmersiveBackground: true,
      mvImmersiveBackgroundScalePercent: 220,
      mvImmersiveBackgroundOffsetXPercent: 0,
      mvImmersiveBackgroundOffsetYPercent: 100,
      mvImmersiveBackgroundBlurPx: 32,
      mvImmersiveBackgroundBrightnessPercent: 60,
      mvImmersiveBackgroundOverlayOpacityPercent: 0,
      mvLyricsReadabilityEnhanced: false,
      mvReplayAudioOnChange: true,
      mvMaxQuality: 'max',
      mvAllow60fps: true,
    });

    expect(normalizeSettings({ mvAutoApplyThreshold: 2 })).toMatchObject({
      mvAutoApplyThreshold: 1,
    });
  });
});
