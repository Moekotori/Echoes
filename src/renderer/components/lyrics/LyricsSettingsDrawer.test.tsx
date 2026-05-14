// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppSettings } from '../../../shared/types/appSettings';
import type { LyricsSearchCandidate, TrackLyrics } from '../../../shared/types/lyrics';
import { LyricsSettingsDrawer } from './LyricsSettingsDrawer';

const makeSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
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
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
  lyricsTranslationEnabled: true,
  lyricsFontSizePx: 36,
  lyricsColor: '#314054',
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

    await waitFor(() => expect(container.querySelectorAll('input[type="range"]').length).toBeGreaterThan(0));
    const fontSizeSlider = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]')).find((input) => {
      const labelText = input.closest('label')?.textContent ?? '';
      return labelText.includes('歌词字号') && !labelText.includes('辅歌词字号');
    }) as HTMLInputElement;

    fireEvent.change(fontSizeSlider, { target: { value: '44' } });

    expect(fontSizeSlider.disabled).toBe(false);
    expect(fontSizeSlider.value).toBe('44');
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

    fireEvent.change(slider, { target: { value: '30' } });

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsAutoAcceptScore: 0.3 }));
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

  it('lets users enable the lyrics player bar drawer', async () => {
    const setSettings = vi.fn().mockResolvedValue(makeSettings({ lyricsPlayerBarDrawerEnabled: true }));
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue(makeSettings()),
        setSettings,
        chooseLyricsWallpaper: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    const toggle = (await screen.findByRole('checkbox', { name: /底栏抽屉/ })) as HTMLInputElement;
    fireEvent.click(toggle);

    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ lyricsPlayerBarDrawerEnabled: true }));
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
    fireEvent.change(secondarySizeSlider, { target: { value: '24' } });

    expect(secondarySizeSlider.value).toBe('24');
    expect(setSettings).toHaveBeenCalledWith({ lyricsRomanizationEnabled: true });
    expect(setSettings).toHaveBeenCalledWith({ lyricsSecondaryFontSizePx: 24 });
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
        clearCache: vi.fn(),
      },
    } as unknown as Window['echo'];

    render(<LyricsSettingsDrawer isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(window.echo?.app.getSettings).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('searchbox', { name: /搜索歌词文本|鎼滅储姝岃瘝鏂囨湰/ }), { target: { value: 'rough query' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Low Match Song')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(searchCandidates).toHaveBeenCalledWith('track-1', 'rough query');
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
