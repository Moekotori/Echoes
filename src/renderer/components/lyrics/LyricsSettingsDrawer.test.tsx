// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppSettings } from '../../../shared/types/appSettings';
import { LyricsSettingsDrawer } from './LyricsSettingsDrawer';

const makeSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  albumMergeStrategy: 'standard',
  artistWallAlbumArtwork: false,
  coverCacheDir: null,
  hideToTrayOnClose: false,
  networkMetadataEnabled: false,
  networkMetadataProviders: ['netease-cloud-music', 'qq-music'],
  lyricsNetworkEnabled: true,
  lyricsPreferredProvider: 'lrclib',
  lyricsEnabledProviders: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsProviderOrder: ['local', 'lrclib', 'netease', 'qqmusic'],
  lyricsDeepSearchEnabled: true,
  lyricsAutoSearch: true,
  lyricsAutoAcceptScore: 0.7,
  lyricsDefaultOffsetMs: 0,
  lyricsEnabled: true,
  lyricsHeaderHidden: false,
  lyricsEmptyStateHidden: true,
  lyricsRomanizationEnabled: true,
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
    const fontSizeSlider = container.querySelector('input[type="range"]') as HTMLInputElement;

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
    const ranges = container.querySelectorAll<HTMLInputElement>('input[type="range"]');
    const backgroundScaleSlider = ranges[1];
    const backgroundOpacitySlider = ranges[2];

    fireEvent.change(backgroundScaleSlider, { target: { value: '120' } });
    fireEvent.change(backgroundOpacitySlider, { target: { value: '40' } });

    expect(backgroundScaleSlider.value).toBe('120');
    expect(backgroundOpacitySlider.value).toBe('40');
    expect(previewListener).toHaveBeenCalledTimes(2);
    expect(settingsChangedListener).not.toHaveBeenCalled();
    expect(setSettings).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(240);
      await Promise.resolve();
    });

    expect(setSettings).toHaveBeenCalledWith({
      lyricsBackgroundScalePercent: 120,
      lyricsCoverOpacityPercent: 40,
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
