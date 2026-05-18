// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppSettings } from '../../../shared/types/appSettings';
import type { LyricsSearchCandidate, TrackLyrics } from '../../../shared/types/lyrics';
import type { MvSettings } from '../../../shared/types/mv';
import { LyricsSettingsDrawer, LyricsSettingsPanel } from './LyricsSettingsDrawer';

const makeSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  appearanceTheme: 'light',
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: false,
  coverCacheDir: null,
  hideToTrayOnClose: false,
  appCustomWallpaperPath: null,
  appWallpaperScalePercent: 100,
  appWallpaperBlurPx: 0,
  appWallpaperBrightnessPercent: 100,
  appWallpaperUiOpacityPercent: 100,
  appWallpaperUnifiedOpacityEnabled: false,
  networkMetadataEnabled: false,
  networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.5,
  lyricsDefaultOffsetMs: 0,
  lyricsGlobalSyncOffsetMs: 0,
  lyricsOffsetControlsEnabled: false,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsPlayerBarDrawerEnabled: false,
  lyricsPlayerBarDrawerOpacityPercent: 78,
  lyricsPlayerBarDrawerColorMode: 'default',
  lyricsPlayerBarDrawerColor: '#232120',
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsWordHighlightEnabled: true,
  lyricsFontSizePx: 40,
  lyricsSecondaryFontSizePx: 22,
  lyricsLineSpacingPercent: 110,
  lyricsLineMaxChars: 0,
  lyricsContextOpacityPercent: 49,
  lyricsColor: '#314054',
  lyricsSmartReadableColorsEnabled: false,
  lyricsHighResolutionNetworkCoverEnabled: false,
  lyricsBackgroundMode: 'theme',
  lyricsCustomWallpaperPath: null,
  lyricsCoverOpacityPercent: 100,
  lyricsCoverBlurPx: 10,
  lyricsCoverBrightnessPercent: 100,
  lyricsBackgroundScalePercent: 100,
  mvEnabledProviders: ['bilibili', 'youtube'],
  mvProviderOrder: ['bilibili', 'youtube'],
  mvAutoSearch: true,
  mvMaxQuality: '1080p',
  mvAllow60fps: true,
  channelBalance: {
    enabled: false,
    balance: 0,
    leftGainDb: 0,
    rightGainDb: 0,
    swapLeftRight: false,
    monoMode: 'off',
    invertLeft: false,
    invertRight: false,
    constantPower: true,
  },
  playerVolume: 1,
  playbackSpeed: 1,
  playbackSpeedMode: 'nightcore',
  scanPerformanceMode: 'balanced',
  duplicateTracksEnabled: false,
  duplicateTracksMode: 'strict',
  duplicateTracksAutoRebuildAfterScan: false,
  discordRichPresenceEnabled: false,
  lastFmEnabled: false,
  lastFmUsername: null,
  lastFmSessionKey: null,
  lastFmScrobbleEnabled: true,
  lastFmNowPlayingEnabled: true,
  lastFmMinScrobbleSeconds: 30,
  lastFmAuthToken: null,
  smtcEnabled: true,
  ...overrides,
});

const makeLyricsCandidate = (overrides: Partial<LyricsSearchCandidate> = {}): LyricsSearchCandidate => ({
  id: 'candidate-1',
  provider: 'lrclib',
  providerLyricsId: 'lyrics-1',
  title: 'Low Match Song',
  artist: 'Different Artist',
  album: 'Different Album',
  durationSeconds: 212,
  instrumental: false,
  hasSynced: true,
  hasPlain: true,
  score: 0.12,
  sourceLabel: 'LRCLIB',
  risk: 'high',
  reasons: ['artist_mismatch'],
  ...overrides,
});

const makeTrackLyrics = (overrides: Partial<TrackLyrics> = {}): TrackLyrics => ({
  id: 'lyrics-1',
  trackId: 'track-1',
  provider: 'lrclib',
  providerLyricsId: 'lyrics-1',
  kind: 'synced',
  title: 'Low Match Song',
  artist: 'Different Artist',
  album: 'Different Album',
  durationSeconds: 212,
  lines: [{ timeMs: 0, text: 'line' }],
  plainText: 'line',
  syncedText: '[00:00.00]line',
  offsetMs: 0,
  score: 0.12,
  cachedAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
  ...overrides,
});

const makeMvSettings = (overrides: Partial<MvSettings> = {}): MvSettings => ({
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: false,
  replayAudioOnChange: true,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: 'max',
  allow60fps: true,
  lyricsReadabilityEnhanced: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LyricsSettingsDrawer', () => {
  it('keeps range sliders interactive while settings are saving', async () => {
    const setSettings = vi.fn(() => new Promise<AppSettings>(() => undefined));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: /显示歌词样式设置/ }));
    await waitFor(() => expect(container.querySelectorAll('input[type="range"]').length).toBeGreaterThan(0));
    const fontSizeSlider = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]')).find((input) => {
      const labelText = input.closest('label')?.textContent ?? '';
      return labelText.includes('歌词字号') && !labelText.includes('辅歌词字号');
    }) as HTMLInputElement;

    vi.useFakeTimers();
    fireEvent.change(fontSizeSlider, { target: { value: '44' } });

    expect(fontSizeSlider.disabled).toBe(false);
    expect(fontSizeSlider.value).toBe('44');
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({ lyricsFontSizePx: 44 });
  });

  it('lets users choose online lyrics sources', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsEnabledProviders: ['local', 'lrclib', 'qqmusic'] }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsEnabledProviders: ['local', 'lrclib'] })),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelectorAll('.lyrics-source-option input').length).toBe(3));
    const qqMusicSource = Array.from(container.querySelectorAll<HTMLInputElement>('.lyrics-source-option input')).find((input) =>
      input.closest('label')?.textContent?.includes('QQ 音乐'),
    );

    expect(qqMusicSource).toBeTruthy();
    fireEvent.click(qqMusicSource as HTMLInputElement);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsEnabledProviders: ['local', 'lrclib', 'qqmusic'] }));
  });

  it('exposes persistent drawer controls in the Settings variant', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsEnabledProviders: ['local', 'lrclib', 'qqmusic'] }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsEnabledProviders: ['local', 'lrclib'] })),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsPanel className="settings-lyrics-panel" variant="settings" />);

    await waitFor(() => expect(container.querySelectorAll('.settings-lyrics-panel .lyrics-source-option input').length).toBe(3));
    expect(screen.queryByText('Lyrics Engine')).toBeNull();
    expect(container.querySelector('.settings-lyrics-panel .lyrics-match-threshold-control')).toBeTruthy();
    expect(container.querySelector('.settings-lyrics-panel .lyrics-background-controls')).toBeTruthy();
    expect(container.querySelector('.settings-lyrics-panel .lyrics-color-panel')).toBeTruthy();
    expect(container.querySelector('.settings-lyrics-panel .lyrics-secondary-size-range')).toBeTruthy();

    const qqMusicSource = Array.from(container.querySelectorAll<HTMLInputElement>('.settings-lyrics-panel .lyrics-source-option input')).find((input) =>
      input.closest('label')?.textContent?.includes('QQ'),
    );

    expect(qqMusicSource).toBeTruthy();
    fireEvent.click(qqMusicSource as HTMLInputElement);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsEnabledProviders: ['local', 'lrclib', 'qqmusic'] }));
  });

  it('updates the lyrics match threshold from 30 to 100 percent with a 50 percent default', async () => {
    const setSettings = vi.fn((patch: Partial<AppSettings>) => Promise.resolve(makeSettings(patch)));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const slider = (await screen.findByRole('slider', { name: '歌词匹配度设置' })) as HTMLInputElement;
    expect(slider.min).toBe('30');
    expect(slider.max).toBe('100');
    expect(slider.value).toBe('50');

    vi.useFakeTimers();
    fireEvent.change(slider, { target: { value: '30' } });

    expect(slider.disabled).toBe(false);
    expect(slider.value).toBe('30');
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({ lyricsAutoAcceptScore: 0.3 });
  });

  it('keeps lyrics display preferences editable when lyrics loading is disabled', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({
          lyricsEnabled: false,
          lyricsHeaderHidden: true,
          lyricsPlayerBarDrawerEnabled: true,
        })),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const enabledToggle = (await screen.findByRole('checkbox', { name: /启用歌词/ })) as HTMLInputElement;
    expect(enabledToggle.checked).toBe(false);

    const thresholdSlider = screen.getByRole('slider', { name: '歌词匹配度设置' }) as HTMLInputElement;
    expect(thresholdSlider.disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /隐藏歌曲信息/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /关闭MV自动显示歌曲信息/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /迷你底栏/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /隐藏纯音乐提示/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /显示罗马音/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /显示中文翻译/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /逐字歌词高亮/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('checkbox', { name: /智能可读颜色/ }) as HTMLInputElement).disabled).toBe(false);

    const opacitySlider = screen.getByText('底栏透明度').closest('label')?.querySelector('input[type="range"]') as HTMLInputElement;
    expect(opacitySlider.disabled).toBe(false);
    const miniColorPanel = container.querySelector('.lyrics-mini-player-color-panel') as HTMLElement;
    expect((within(miniColorPanel).getByRole('button', { name: '跟随封面' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('previews background tuning immediately but debounces persisted settings writes', async () => {
    const setSettings = vi.fn((patch: Partial<AppSettings>) => Promise.resolve(makeSettings(patch)));
    const previewListener = vi.fn();
    const settingsChangedListener = vi.fn();
    window.addEventListener('lyrics:display-settings-changed', previewListener);
    window.addEventListener('settings:changed', settingsChangedListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: /显示歌词样式设置/ }));
    await waitFor(() => expect(container.querySelectorAll('input[type="range"]').length).toBeGreaterThan(4));
    vi.useFakeTimers();
    const ranges = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]'));
    const backgroundScaleSlider = ranges.find((input) => input.closest('label')?.textContent?.includes('背景放大')) as HTMLInputElement;
    const backgroundOpacitySlider = ranges.find((input) => input.closest('label')?.textContent?.includes('背景透明度')) as HTMLInputElement;
    const contextOpacitySlider = ranges.find((input) => input.closest('label')?.textContent?.includes('上下文透明度')) as HTMLInputElement;

    fireEvent.change(backgroundScaleSlider, { target: { value: '120' } });
    fireEvent.change(backgroundOpacitySlider, { target: { value: '40' } });
    fireEvent.change(contextOpacitySlider, { target: { value: '64' } });

    expect(backgroundScaleSlider.value).toBe('120');
    expect(backgroundOpacitySlider.value).toBe('40');
    expect(contextOpacitySlider.value).toBe('64');
    expect(previewListener).toHaveBeenCalledTimes(3);
    expect(settingsChangedListener).not.toHaveBeenCalled();
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({
      lyricsBackgroundScalePercent: 120,
      lyricsCoverOpacityPercent: 40,
      lyricsContextOpacityPercent: 64,
    });
    expect(settingsChangedListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('lyrics:display-settings-changed', previewListener);
    window.removeEventListener('settings:changed', settingsChangedListener);
  });

  it('previews and saves custom lyrics line spacing', async () => {
    const setSettings = vi.fn((patch: Partial<AppSettings>) => Promise.resolve(makeSettings(patch)));
    const previewListener = vi.fn();
    window.addEventListener('lyrics:display-settings-changed', previewListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: /显示歌词样式设置/ }));
    await waitFor(() => expect(container.querySelectorAll('input[type="range"]').length).toBeGreaterThan(0));
    vi.useFakeTimers();
    const spacingSlider = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]')).find(
      (input) => input.min === '60' && input.max === '150',
    ) as HTMLInputElement;

    fireEvent.change(spacingSlider, { target: { value: '116' } });

    expect(spacingSlider.value).toBe('116');
    expect(previewListener).toHaveBeenCalledWith(expect.objectContaining({ detail: { lyricsLineSpacingPercent: 116 } }));
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({ lyricsLineSpacingPercent: 116 });

    window.removeEventListener('lyrics:display-settings-changed', previewListener);
  });

  it('previews and saves custom lyrics characters per line', async () => {
    const setSettings = vi.fn((patch: Partial<AppSettings>) => Promise.resolve(makeSettings(patch)));
    const previewListener = vi.fn();
    window.addEventListener('lyrics:display-settings-changed', previewListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const slider = (await screen.findByRole('slider', { name: /每行字数/ })) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('80');
    expect(slider.value).toBe('0');

    vi.useFakeTimers();
    fireEvent.change(slider, { target: { value: '32' } });

    expect(slider.value).toBe('32');
    expect(screen.getByText('32字')).toBeTruthy();
    expect(previewListener).toHaveBeenCalledWith(expect.objectContaining({ detail: { lyricsLineMaxChars: 32 } }));
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({ lyricsLineMaxChars: 32 });

    window.removeEventListener('lyrics:display-settings-changed', previewListener);
  });

  it('updates the lyrics color preview and broadcasts the color change immediately', async () => {
    const setSettings = vi.fn((patch: Partial<AppSettings>) => Promise.resolve(makeSettings(patch)));
    const previewListener = vi.fn();
    window.addEventListener('lyrics:display-settings-changed', previewListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelector('.lyrics-style-toggle input')).toBeTruthy());
    fireEvent.click(container.querySelector('.lyrics-style-toggle input') as HTMLInputElement);
    await waitFor(() => expect(container.querySelector('.lyrics-color-panel')).toBeTruthy());
    const colorPanel = container.querySelector('.lyrics-color-panel') as HTMLElement;
    const colorPreview = colorPanel.querySelector('.lyrics-color-preview') as HTMLElement;
    const pinkSwatch = Array.from(colorPanel.querySelectorAll<HTMLButtonElement>('.lyrics-color-swatch')).find(
      (button) => button.style.backgroundColor === 'rgb(255, 138, 128)',
    ) as HTMLButtonElement;

    fireEvent.click(pinkSwatch);

    expect(colorPreview.style.getPropertyValue('--lyrics-preview-color')).toBe('#FF8A80');
    expect(previewListener).toHaveBeenCalledWith(expect.objectContaining({ detail: { lyricsColor: '#FF8A80' } }));
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsColor: '#FF8A80' }));

    window.removeEventListener('lyrics:display-settings-changed', previewListener);
  });

  it('lets users toggle romanization display', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsRomanizationEnabled: false }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = (await screen.findByRole('checkbox', { name: /显示罗马音/ })) as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsRomanizationEnabled: false }));
  });

  it('lets users toggle translation display', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsTranslationEnabled: false }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = (await screen.findByRole('checkbox', { name: /显示中文翻译/ })) as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsTranslationEnabled: false }));
  });

  it('lets users toggle word highlight display', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsWordHighlightEnabled: false }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = (await screen.findByRole('checkbox', { name: /逐字歌词高亮/ })) as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsWordHighlightEnabled: false }));
  });

  it('lets users enable the lyrics mini player bar', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsPlayerBarDrawerEnabled: true }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = (await screen.findByRole('checkbox', { name: /迷你底栏/ })) as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsPlayerBarDrawerEnabled: true }));
  });

  it('shows mini player tuning only after the mini player is enabled', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsPlayerBarDrawerEnabled: false })),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { unmount } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await screen.findByRole('checkbox', { name: /迷你底栏/ });
    expect(screen.queryByText('底栏透明度')).toBeNull();
    expect(screen.queryByText('底栏颜色')).toBeNull();

    unmount();
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsPlayerBarDrawerEnabled: true })),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('底栏透明度')).toBeTruthy();
    expect(screen.getByText('底栏颜色')).toBeTruthy();
    const miniColorPanel = document.querySelector('.lyrics-mini-player-color-panel') as HTMLElement;
    expect(within(miniColorPanel).getByRole('button', { name: '跟随封面' })).toBeTruthy();
  });

  it('lets users tune mini player opacity and color mode', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({
      lyricsPlayerBarDrawerEnabled: true,
      lyricsPlayerBarDrawerOpacityPercent: 66,
      lyricsPlayerBarDrawerColorMode: 'cover',
    }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsPlayerBarDrawerEnabled: true })),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);
    const opacityLabel = await screen.findByText('底栏透明度');
    const opacitySlider = opacityLabel.closest('label')?.querySelector('input[type="range"]') as HTMLInputElement;

    vi.useFakeTimers();
    fireEvent.change(opacitySlider, { target: { value: '66' } });
    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({ lyricsPlayerBarDrawerOpacityPercent: 66 });
    vi.useRealTimers();

    const miniColorPanel = container.querySelector('.lyrics-mini-player-color-panel') as HTMLElement;
    fireEvent.click(within(miniColorPanel).getByRole('button', { name: '跟随封面' }));

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsPlayerBarDrawerColorMode: 'cover' }));
    expect(container.querySelector('.lyrics-mini-player-color-panel')).toBeTruthy();
  });

  it('does not rebroadcast full lyrics settings after saving a non-layout toggle', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsPlayerBarDrawerEnabled: true }));
    const settingsChangedListener = vi.fn();
    const displaySettingsChangedListener = vi.fn();
    window.addEventListener('settings:changed', settingsChangedListener);
    window.addEventListener('lyrics:display-settings-changed', displaySettingsChangedListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = await waitFor(() => {
      const playerDrawerToggle = Array.from(container.querySelectorAll<HTMLInputElement>('.audio-toggle-row input')).find((input) =>
        /迷你底栏/.test(input.closest('label')?.textContent ?? ''),
      );
      expect(playerDrawerToggle).toBeTruthy();
      return playerDrawerToggle as HTMLInputElement;
    });
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsPlayerBarDrawerEnabled: true }));

    const settingDetails = settingsChangedListener.mock.calls.map(([event]) => (event as CustomEvent).detail);
    const displayDetails = displaySettingsChangedListener.mock.calls.map(([event]) => (event as CustomEvent).detail);
    expect(settingDetails).toEqual([{ lyricsPlayerBarDrawerEnabled: true }]);
    expect(displayDetails).toEqual([{ lyricsPlayerBarDrawerEnabled: true }]);

    window.removeEventListener('settings:changed', settingsChangedListener);
    window.removeEventListener('lyrics:display-settings-changed', displaySettingsChangedListener);
  });

  it('shows the MV track info toggle only when lyrics song info is hidden', async () => {
    const getSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsHeaderHidden: true }));
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsMvAutoShowTrackInfoDisabled: false }));
    window.echo = {
      app: {
        getSettings,
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { unmount } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = (await screen.findByRole('checkbox', { name: /关闭MV自动显示歌曲信息/ })) as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsMvAutoShowTrackInfoDisabled: false }));

    getSettings.mockResolvedValue(makeSettings({ lyricsHeaderHidden: false }));
    unmount();
    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: /关闭MV自动显示歌曲信息/ })).toBeNull());
  });

  it('lets users enable lyrics offset controls from the drawer', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsOffsetControlsEnabled: true }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsOffsetControlsEnabled: false })),
        setSettings,
      },
      lyrics: {
        getForTrack: vi.fn().mockResolvedValue(null),
        searchCandidates: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        markInstrumental: vi.fn(),
        rejectCandidate: vi.fn(),
        setOffset: vi.fn(),
        clearCache: vi.fn(),
      },
      playback: { getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }) },
      audio: { getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }) },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = await screen.findByLabelText(/显示本歌曲延迟校准|显示歌词校准条/);
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsOffsetControlsEnabled: true }));
  });

  it('expands secondary lyric font size while romanization or translation is enabled', async () => {
    const setSettings = vi.fn((patch: Partial<AppSettings>) => Promise.resolve(makeSettings(patch)));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsRomanizationEnabled: false, lyricsTranslationEnabled: false })),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(screen.queryByText('辅歌词字号')).toBeNull());
    fireEvent.click(await screen.findByRole('checkbox', { name: /显示罗马音/ }));

    expect(await screen.findByText('辅歌词字号')).toBeTruthy();
    const secondarySizeSlider = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]')).find((input) =>
      input.closest('label')?.textContent?.includes('辅歌词字号'),
    ) as HTMLInputElement;
    vi.useFakeTimers();
    fireEvent.change(secondarySizeSlider, { target: { value: '24' } });

    expect(secondarySizeSlider.value).toBe('24');
    expect(setSettings).toHaveBeenCalledWith({ lyricsRomanizationEnabled: true });

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({ lyricsSecondaryFontSizePx: 24 });
  });

  it('keeps lyrics style controls open by default', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelector('.lyrics-style-toggle input')).toBeTruthy());
    expect((container.querySelector('.lyrics-style-toggle input') as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('.lyrics-drawer-range[hidden]')).toBeNull();
    expect(container.textContent).toContain('包含辅助字号、歌词字号、歌词行距、上下文透明度和歌词颜色。');

    fireEvent.click(container.querySelector('.lyrics-style-toggle input') as HTMLInputElement);

    expect(container.querySelector('.lyrics-drawer-range[hidden]')).toBeTruthy();
  });

  it('toggles lyrics readability enhancement from the lyrics background section', async () => {
    const setMvSettings = vi.fn(async (patch: Partial<MvSettings>) => makeMvSettings(patch));
    const settingsChangedListener = vi.fn();
    window.addEventListener('settings:changed', settingsChangedListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      mv: {
        getSettings: vi.fn().mockResolvedValue(makeMvSettings()),
        setSettings: setMvSettings,
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelector('.lyrics-readability-toggle input')).toBeTruthy());
    const toggle = container.querySelector('.lyrics-readability-toggle input') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.checked).toBe(true);
    await waitFor(() => expect(setMvSettings).toHaveBeenCalledWith({ lyricsReadabilityEnhanced: true }));
    expect(settingsChangedListener).toHaveBeenCalledWith(expect.objectContaining({ detail: { lyricsReadabilityEnhanced: true } }));

    window.removeEventListener('settings:changed', settingsChangedListener);
  });

  it('toggles smart readable colors from the lyrics background section', async () => {
    const setSettings = vi.fn(async (patch: Partial<AppSettings>) => makeSettings(patch));
    const settingsChangedListener = vi.fn();
    const displaySettingsChangedListener = vi.fn();
    window.addEventListener('settings:changed', settingsChangedListener);
    window.addEventListener('lyrics:display-settings-changed', displaySettingsChangedListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelector('.lyrics-smart-readable-toggle input')).toBeTruthy());
    const toggle = container.querySelector('.lyrics-smart-readable-toggle input') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.checked).toBe(true);
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsSmartReadableColorsEnabled: true }));
    expect(settingsChangedListener).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { lyricsSmartReadableColorsEnabled: true } }),
    );
    expect(displaySettingsChangedListener).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { lyricsSmartReadableColorsEnabled: true } }),
    );

    window.removeEventListener('settings:changed', settingsChangedListener);
    window.removeEventListener('lyrics:display-settings-changed', displaySettingsChangedListener);
  });

  it('toggles high resolution network cover lookup from the lyrics background section', async () => {
    const setSettings = vi.fn(async (patch: Partial<AppSettings>) => makeSettings({ lyricsBackgroundMode: 'cover', ...patch }));
    const settingsChangedListener = vi.fn();
    const displaySettingsChangedListener = vi.fn();
    window.addEventListener('settings:changed', settingsChangedListener);
    window.addEventListener('lyrics:display-settings-changed', displaySettingsChangedListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings({ lyricsBackgroundMode: 'cover' })),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelector('.lyrics-background-network-cover-toggle input')).toBeTruthy());
    const toggle = container.querySelector('.lyrics-background-network-cover-toggle input') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.checked).toBe(true);
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsHighResolutionNetworkCoverEnabled: true }));
    expect(settingsChangedListener).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { lyricsHighResolutionNetworkCoverEnabled: true } }),
    );
    expect(displaySettingsChangedListener).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { lyricsHighResolutionNetworkCoverEnabled: true } }),
    );

    window.removeEventListener('settings:changed', settingsChangedListener);
    window.removeEventListener('lyrics:display-settings-changed', displaySettingsChangedListener);
  });

  it('shows the current track lyrics provider instead of enabled sources', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }),
      },
      lyrics: {
        getForTrack: vi.fn().mockResolvedValue({ provider: 'netease' }),
      },
    } as unknown as Window['echo'];

    const { container } = render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByText('网易云音乐').length).toBeGreaterThan(0));

    expect(container.querySelector('.audio-engine-meter__badges')).toBeNull();
    expect(container.querySelector('.lyrics-engine-meter')?.textContent).not.toContain('enabled');
  });

  it('shows low scoring lyric search results in the drawer', async () => {
    const searchCandidates = vi.fn().mockResolvedValue([
      makeLyricsCandidate({ id: 'low-candidate', score: 0.12, risk: 'high' }),
    ]);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }),
      },
      lyrics: {
        getForTrack: vi.fn().mockResolvedValue(makeTrackLyrics()),
        searchCandidates,
        applyCandidate: vi.fn().mockResolvedValue(makeTrackLyrics()),
        markInstrumental: vi.fn(),
        clearCache: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(window.echo?.app.getSettings).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('searchbox', { name: /搜索歌词文本|鎼滅储姝岃瘝鏂囨湰/ }), { target: { value: 'rough query' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Low Match Song')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(searchCandidates).toHaveBeenCalledWith('track-1', 'rough query', 'lrclib');
    expect(searchCandidates).toHaveBeenCalledWith('track-1', 'rough query', 'netease');
    expect(searchCandidates).toHaveBeenCalledWith('track-1', 'rough query', 'qqmusic');
  });

  it('marks the current track as instrumental from the drawer', async () => {
    const appliedListener = vi.fn();
    window.addEventListener('lyrics:candidate-applied', appliedListener);
    const instrumentalLyrics = makeTrackLyrics({
      kind: 'instrumental',
      lines: [],
      plainText: null,
      syncedText: null,
    });
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
      playback: {
        getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue({ currentTrackId: 'track-1' }),
      },
      lyrics: {
        getForTrack: vi.fn().mockResolvedValue(null),
        searchCandidates: vi.fn().mockResolvedValue([]),
        applyCandidate: vi.fn(),
        markInstrumental: vi.fn().mockResolvedValue(instrumentalLyrics),
        clearCache: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /标记为纯音乐/ }));

    await waitFor(() => expect(window.echo?.lyrics.markInstrumental).toHaveBeenCalledWith('track-1'));
    expect(appliedListener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          trackId: 'track-1',
          lyrics: instrumentalLyrics,
        },
      }),
    );
    expect((await screen.findByRole('button', { name: /已标记为纯音乐/ }) as HTMLButtonElement).disabled).toBe(true);

    window.removeEventListener('lyrics:candidate-applied', appliedListener);
  });

  it('dispatches current-track lyric actions from settings', async () => {
    const searchListener = vi.fn();
    const rematchListener = vi.fn();
    window.addEventListener('lyrics:search-requested', searchListener);
    window.addEventListener('lyrics:rematch-requested', rematchListener);
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings: vi.fn(),
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(window.echo?.app.getSettings).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索歌词文本' }), { target: { value: 'manual query' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: /重新匹配/ }));

    expect(searchListener).toHaveBeenCalledTimes(1);
    expect(searchListener.mock.calls[0][0]).toMatchObject({ detail: { query: 'manual query' } });
    expect(rematchListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('lyrics:search-requested', searchListener);
    window.removeEventListener('lyrics:rematch-requested', rematchListener);
  });
});
