import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from './AccountService';
import { SpotifyAuthService } from './SpotifyAuthService';

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(async () => undefined),
}));
const tempDirs: string[] = [];

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd(),
  },
  BrowserWindow: vi.fn(),
  shell: {
    openExternal,
  },
}));

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const createSpotifyService = (overrides: Partial<Parameters<AccountService['saveSpotifyTokens']>[0]> = {}): SpotifyAuthService => {
  const dir = mkdtempSync(join(tmpdir(), 'echo-spotify-auth-'));
  tempDirs.push(dir);
  const accountService = new AccountService(join(dir, 'accounts.json'));
  accountService.saveSpotifyTokens({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenType: 'Bearer',
    scope: 'streaming user-read-playback-state user-modify-playback-state',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    username: 'spotify-user',
    displayName: 'Spotify User',
    avatarUrl: null,
    ...overrides,
  });
  return new SpotifyAuthService(accountService);
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  openExternal.mockClear();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('SpotifyAuthService ensureConnectDevice', () => {
  it('uses an existing Spotify Connect device without opening external players', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      devices: [
        {
          id: 'device-1',
          name: 'Spotify Desktop',
          type: 'Computer',
          is_active: true,
          is_restricted: false,
          volume_percent: 42,
        },
      ],
    })));

    const result = await createSpotifyService().ensureConnectDevice({
      uri: 'spotify:track:abc123',
      webUrl: 'https://open.spotify.com/track/abc123',
    });

    expect(result).toMatchObject({
      deviceId: 'device-1',
      deviceName: 'Spotify Desktop',
      launched: 'none',
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens desktop first, then web player, and resolves when a device appears', async () => {
    vi.useFakeTimers();
    let deviceCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      deviceCalls += 1;
      return jsonResponse({
        devices: deviceCalls >= 11
          ? [
              {
                id: 'device-web',
                name: 'Spotify Web Player',
                type: 'Computer',
                is_active: false,
                is_restricted: false,
                volume_percent: null,
              },
            ]
          : [],
      });
    }));

    const promise = createSpotifyService().ensureConnectDevice({
      uri: 'spotify:track:abc123',
      webUrl: 'https://open.spotify.com/track/abc123',
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(openExternal).toHaveBeenNthCalledWith(1, 'spotify:');
    expect(openExternal).toHaveBeenNthCalledWith(2, 'https://open.spotify.com/track/abc123');
    expect(result).toMatchObject({
      deviceId: 'device-web',
      deviceName: 'Spotify Web Player',
      launched: 'web',
    });
  });

  it('keeps polling devices after a transient discovery failure', async () => {
    vi.useFakeTimers();
    const service = createSpotifyService();
    let deviceCalls = 0;
    vi.spyOn(service, 'getDevices').mockImplementation(async () => {
      deviceCalls += 1;
      if (deviceCalls === 1) {
        throw new Error('device request timed out');
      }

      return deviceCalls >= 3
        ? [
            {
              id: 'device-desktop',
              name: 'Spotify Desktop',
              type: 'Computer',
              isActive: false,
              isRestricted: false,
              volumePercent: 50,
            },
          ]
        : [];
    });

    const promise = service.ensureConnectDevice({
      uri: 'spotify:track:abc123',
      webUrl: 'https://open.spotify.com/track/abc123',
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(openExternal).toHaveBeenCalledWith('spotify:');
    expect(result).toMatchObject({
      deviceId: 'device-desktop',
      launched: 'desktop',
    });
  });
});

describe('SpotifyAuthService token refresh', () => {
  it('coalesces concurrent access-token refreshes', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      access_token: 'fresh-access-token',
      refresh_token: 'fresh-refresh-token',
      token_type: 'Bearer',
      scope: 'streaming',
      expires_in: 3600,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createSpotifyService({
      accessToken: 'expired-access-token',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const [left, right] = await Promise.all([service.getAccessToken(), service.getAccessToken()]);

    expect(left).toBe('fresh-access-token');
    expect(right).toBe('fresh-access-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
