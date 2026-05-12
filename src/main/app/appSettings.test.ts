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
    expect(settings.hideToTrayOnClose).toBe(true);
    expect(settings.networkMetadataProviders).toEqual(['qq-music']);
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
});
