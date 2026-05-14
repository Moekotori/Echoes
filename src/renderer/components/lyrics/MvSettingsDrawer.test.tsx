// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LibraryTrack } from '../../../shared/types/library';
import type { MvMatchCandidate, MvSettings, TrackVideo } from '../../../shared/types/mv';
import { I18nProvider } from '../../i18n/I18nProvider';
import { PlaybackQueueProvider, usePlaybackQueue } from '../../stores/PlaybackQueueProvider';
import { MvSettingsDrawer } from './MvSettingsDrawer';

const makeTrack = (): LibraryTrack => ({
  id: 'track-1',
  path: 'D:\\Music\\song.flac',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  albumArtist: 'Test Artist',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 44100,
  bitDepth: 16,
  bitrate: null,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
});

const makeVideo = (): TrackVideo => ({
  id: 'video-1',
  trackId: 'track-1',
  provider: 'local',
  sourceType: 'manual',
  sourceId: 'local:1',
  title: 'Test Song MV',
  artist: 'Test Artist',
  url: null,
  providerUrl: null,
  thumbnailUrl: null,
  filePath: null,
  mediaUrl: 'echo-video://mv/video-1',
  mimeType: 'video/mp4',
  durationSeconds: null,
  width: null,
  height: null,
  selectedQualityId: null,
  qualityLabel: null,
  fps: null,
  score: 1,
  selected: true,
  playableInApp: true,
  rawProviderJson: null,
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
});

const makeCandidate = (): MvMatchCandidate => ({
  id: 'candidate-1',
  provider: 'local',
  sourceType: 'sidecar',
  title: 'Test Song',
  artist: 'Test Artist',
  filePath: null,
  url: null,
  providerUrl: null,
  thumbnailUrl: null,
  uploader: null,
  availableQualities: [],
  durationSeconds: null,
  score: 0.95,
  playableInApp: true,
  reasons: ['same basename'],
});

const defaultMvSettings: MvSettings = {
  autoSearch: true,
  autoPreload: true,
  restartAudioOnLoad: false,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: '1080p',
  allow60fps: true,
};

const QueueSeed = ({ children, track }: { children: JSX.Element; track: LibraryTrack }): JSX.Element => {
  const { replaceQueue, setCurrentTrackId } = usePlaybackQueue();

  useEffect(() => {
    replaceQueue([track]);
    setCurrentTrackId(track.id);
  }, [replaceQueue, setCurrentTrackId, track]);

  return children;
};

const renderDrawer = (settings: MvSettings = defaultMvSettings, selectedVideo: TrackVideo | null = null) => {
  const track = makeTrack();
  window.localStorage.setItem('echo-next.locale', 'en-US');
  window.echo = {
    mv: {
      getSelected: vi.fn().mockResolvedValue(selectedVideo),
      getSettings: vi.fn().mockResolvedValue(settings),
      setSettings: vi.fn().mockImplementation(async (patch: Partial<MvSettings>) => ({ ...settings, ...patch })),
      findLocalCandidates: vi.fn().mockResolvedValue([makeCandidate()]),
      searchNetworkCandidates: vi.fn().mockResolvedValue([]),
      getCandidates: vi.fn().mockResolvedValue([]),
      resolveStreams: vi.fn().mockImplementation(async () => ({ video: selectedVideo ?? makeVideo(), variants: [] })),
      setQuality: vi.fn(),
      chooseLocalVideo: vi.fn().mockResolvedValue(makeVideo()),
      bindLocalVideo: vi.fn(),
      bindUrl: vi.fn().mockResolvedValue({ ...makeVideo(), provider: 'bilibili', sourceId: 'BV1ECHO', providerUrl: 'https://www.bilibili.com/video/BV1ECHO' }),
      selectVideo: vi.fn().mockResolvedValue(makeVideo()),
      clearSelected: vi.fn(),
      openExternal: vi.fn(),
    },
  } as unknown as Window['echo'];

  return render(
    <I18nProvider>
      <PlaybackQueueProvider>
        <QueueSeed track={track}>
          <MvSettingsDrawer isOpen onClose={vi.fn()} />
        </QueueSeed>
      </PlaybackQueueProvider>
    </I18nProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MvSettingsDrawer', () => {
  it('shows selected MV title and video quality in the engine meter', async () => {
    renderDrawer(defaultMvSettings, { ...makeVideo(), width: 1920, height: 1080, fps: 60, qualityLabel: null });

    const engineMeter = within(await screen.findByLabelText('MV engine status'));
    expect(engineMeter.getByText('MV Title')).toBeTruthy();
    expect(engineMeter.getByText('Test Song MV')).toBeTruthy();
    expect(engineMeter.getByText('1080p / 60fps')).toBeTruthy();
    expect(engineMeter.queryByText('Network')).toBeNull();
  });

  it('contains the MV choose action and omits the local search shortcut', async () => {
    renderDrawer();

    expect(await screen.findByRole('button', { name: /Choose file/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Find local/ })).toBeNull();
  });

  it('chooses a local MV file from the drawer', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /Choose file/ }));

    await waitFor(() => expect(window.echo.mv.chooseLocalVideo).toHaveBeenCalledWith('track-1'));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mv:changed' }));
  });

  it('updates the max network quality from the drawer menu', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /Max quality 1080p/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Max' }));

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ maxQuality: 'max' }));
  });

  it('toggles automatic MV search from the drawer', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /Auto search network MV/ }));

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ autoSearch: false }));
  });

  it('toggles the top-level MV switch from the top of the drawer', async () => {
    renderDrawer();

    const toggle = await screen.findByRole('button', { name: /Enable MV/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle);

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ enabled: false }));
  });

  it('updates the automatic MV apply threshold from the drawer', async () => {
    renderDrawer();

    const slider = await screen.findByRole('slider', { name: /Auto-apply match/ });
    expect((slider as HTMLInputElement).value).toBe('70');

    fireEvent.change(slider, { target: { value: '82' } });

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ autoApplyThreshold: 0.82 }));
  });

  it('toggles MV preload and restart sync from the drawer', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /Preload MV/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Follow music progress/ }));

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ autoPreload: false }));
    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ restartAudioOnLoad: true }));
  });

  it('shows immersive MV controls and updates zoom', async () => {
    renderDrawer();

    expect(await screen.findByRole('button', { name: /Immersive MV background/ })).toBeTruthy();
    const slider = screen.getByRole('slider', { name: /Background zoom/ });
    expect((slider as HTMLInputElement).value).toBe('115');

    fireEvent.change(slider, { target: { value: '140' } });

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ immersiveBackgroundScalePercent: 140 }));
  });

  it('updates immersive MV visual tuning controls', async () => {
    renderDrawer();

    const blur = await screen.findByRole('slider', { name: /Glass blur/ });
    const brightness = screen.getByRole('slider', { name: /Background brightness/ });
    const overlay = screen.getByRole('slider', { name: /Dark overlay/ });

    expect((blur as HTMLInputElement).value).toBe('0');
    expect((brightness as HTMLInputElement).value).toBe('100');
    expect((overlay as HTMLInputElement).value).toBe('0');
    expect(screen.queryByRole('slider', { name: /Horizontal position/ })).toBeNull();
    expect(screen.queryByRole('slider', { name: /Vertical position/ })).toBeNull();

    fireEvent.change(blur, { target: { value: '10' } });
    fireEvent.change(brightness, { target: { value: '118' } });
    fireEvent.change(overlay, { target: { value: '35' } });

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ immersiveBackgroundBlurPx: 10 }));
    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ immersiveBackgroundBrightnessPercent: 118 }));
    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ immersiveBackgroundOverlayOpacityPercent: 35 }));
  });

  it('toggles immersive MV lyrics readability enhancement from the drawer', async () => {
    renderDrawer();

    const toggle = await screen.findByRole('button', { name: /Lyrics readability boost/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ lyricsReadabilityEnhanced: true }));
  });

  it('resets immersive MV background tuning', async () => {
    renderDrawer({
      ...defaultMvSettings,
      immersiveBackgroundScalePercent: 160,
      immersiveBackgroundOffsetXPercent: 12,
      immersiveBackgroundOffsetYPercent: 88,
      immersiveBackgroundBlurPx: 16,
      immersiveBackgroundBrightnessPercent: 70,
      immersiveBackgroundOverlayOpacityPercent: 80,
      lyricsReadabilityEnhanced: true,
    });

    fireEvent.click(await screen.findByRole('button', { name: /Reset immersive background/ }));

    await waitFor(() =>
      expect(window.echo.mv.setSettings).toHaveBeenCalledWith({
        immersiveBackgroundScalePercent: 115,
        immersiveBackgroundOffsetXPercent: 50,
        immersiveBackgroundOffsetYPercent: 50,
        immersiveBackgroundBlurPx: 0,
        immersiveBackgroundBrightnessPercent: 100,
        immersiveBackgroundOverlayOpacityPercent: 0,
        lyricsReadabilityEnhanced: false,
      }),
    );
  });

  it('reorders network sources by dragging the priority handle', async () => {
    renderDrawer();

    const dragData = {
      effectAllowed: '',
      dropEffect: '',
      getData: vi.fn(() => 'bilibili'),
      setData: vi.fn(),
    };

    const youtubeRow = screen.getByRole('button', { name: 'YouTube' }).closest('.mv-source-row');
    expect(youtubeRow).toBeTruthy();

    fireEvent.dragStart(await screen.findByRole('button', { name: /Drag Bilibili/ }), { dataTransfer: dragData });
    fireEvent.dragOver(youtubeRow as Element, { dataTransfer: dragData });
    fireEvent.drop(youtubeRow as Element, { dataTransfer: dragData });

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ providerOrder: ['youtube', 'bilibili'] }));
  });

  it('refreshes the current MV when automatic MV search is enabled', async () => {
    renderDrawer({ ...defaultMvSettings, autoSearch: false });

    fireEvent.click(await screen.findByRole('button', { name: /Auto search network MV/ }));

    await waitFor(() => expect(window.echo.mv.setSettings).toHaveBeenCalledWith({ autoSearch: true }));
    await waitFor(() => expect(window.echo.mv.searchNetworkCandidates).toHaveBeenCalledWith('track-1', 'Test Song Test Artist'));
  });

  it('searches network MVs with the custom query input', async () => {
    renderDrawer();

    const input = await screen.findByRole('textbox', { name: /MV search keywords/ });
    expect((input as HTMLInputElement).value).toBe('Test Song Test Artist');

    fireEvent.change(input, { target: { value: 'Roselia HEROIC ADVENT' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Search network MV/ })[1]);

    await waitFor(() => expect(window.echo.mv.searchNetworkCandidates).toHaveBeenCalledWith('track-1', 'Roselia HEROIC ADVENT'));
  });

  it('binds a pasted custom MV link to the current track', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderDrawer();

    const input = await screen.findByRole('textbox', { name: /Custom MV link/ });
    fireEvent.change(input, { target: { value: 'https://www.bilibili.com/video/BV1ECHO' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply custom MV/ }));

    await waitFor(() => expect(window.echo.mv.bindUrl).toHaveBeenCalledWith('track-1', 'https://www.bilibili.com/video/BV1ECHO'));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mv:changed' }));
  });

  it('links the custom MV playing status and shows quality with the stream badge', async () => {
    renderDrawer(defaultMvSettings, {
      ...makeVideo(),
      provider: 'bilibili',
      sourceId: 'BV1MNV',
      providerUrl: 'https://www.bilibili.com/video/BV1MNV',
      playableInApp: true,
      qualityLabel: null,
      height: 4320,
    });

    const playingLink = await screen.findByRole('link', { name: /Now playing: Bilibili - BV1MNV/ });
    expect(playingLink.getAttribute('href')).toBe('https://www.bilibili.com/video/BV1MNV');

    const badgeRow = screen.getByText('Direct stream (DASH)').closest('.mv-custom-badges');
    expect(badgeRow).toBeTruthy();
    expect(within(badgeRow as HTMLElement).getByText('8K')).toBeTruthy();
  });

  it('notifies the MV panel when network search auto-selects a candidate', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderDrawer();
    await screen.findByRole('textbox', { name: /MV search keywords/ });
    vi.mocked(window.echo.mv.getSelected).mockResolvedValue(makeVideo());

    fireEvent.click(await screen.findAllByRole('button', { name: /Search network MV/ }).then((buttons) => buttons[1]));

    await waitFor(() => expect(window.echo.mv.searchNetworkCandidates).toHaveBeenCalledWith('track-1', 'Test Song Test Artist'));
    await waitFor(() => expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mv:changed' })));
  });
});
