import { execFile, execFileSync } from 'node:child_process';
import type { AudioDeviceInfo } from './audioTypes';
import { isAdvancedNativeOutputPlatform, isNativeSharedOutputPlatform } from '../../shared/utils/audioPlatformCapabilities';
import { resolveHostBinary } from './NativeOutputBridge';

export type DeviceServiceDependencies = {
  hostBinary?: string | null;
  execFileSync?: typeof execFileSync;
  execFile?: typeof execFile;
  platform?: NodeJS.Platform | string;
  logger?: (message: string) => void;
};

export type DeviceListOptions = {
  useJuceOutput?: boolean;
};

const parsePositiveInteger = (value: string | undefined): number | null => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseDeviceListLine = (line: string, outputMode: AudioDeviceInfo['outputMode']): AudioDeviceInfo | null => {
  const parts = line.trim().split('\t');

  if (parts.length < 2) {
    return null;
  }

  const index = Number.parseInt(parts[0], 10);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  return {
    id: `${outputMode}:${index}`,
    index,
    name: parts[1],
    outputMode,
    sampleRate: parsePositiveInteger(parts[2]),
    isDefault: parts[3] === '1',
    sharedDeviceSampleRate: parsePositiveInteger(parts[4]),
  };
};

export class DeviceService {
  private readonly exec: typeof execFileSync;
  private readonly execAsync: typeof execFile;
  private readonly hostBinary: string | null;
  private readonly platform: NodeJS.Platform | string;
  private readonly logger: (message: string) => void;
  private readonly sharedCacheTtlMs = 5000;
  private readonly asioCacheTtlMs = 60_000;
  private readonly sharedCache = new Map<string, { at: number; devices: AudioDeviceInfo[] }>();
  private readonly asioCache = new Map<string, { at: number; devices: AudioDeviceInfo[] }>();
  private readonly sharedPending = new Map<string, Promise<AudioDeviceInfo[]>>();
  private readonly asioPending = new Map<string, Promise<AudioDeviceInfo[]>>();

  constructor(dependencies: DeviceServiceDependencies = {}) {
    this.exec = dependencies.execFileSync ?? execFileSync;
    this.execAsync = dependencies.execFile ?? execFile;
    this.hostBinary = dependencies.hostBinary ?? null;
    this.platform = dependencies.platform ?? process.platform;
    this.logger = dependencies.logger ?? ((message) => console.warn(message));
  }

  listDevices(options: DeviceListOptions = {}): AudioDeviceInfo[] {
    return [...this.listSharedDevices(options), ...this.listAsioDevices(options)];
  }

  async listDevicesAsync(options: DeviceListOptions = {}): Promise<AudioDeviceInfo[]> {
    const [sharedDevices, asioDevices] = await Promise.all([
      this.listSharedDevicesAsync(options),
      this.listAsioDevicesAsync(options),
    ]);
    return [...sharedDevices, ...asioDevices];
  }

  listSharedDevices(options: DeviceListOptions = {}): AudioDeviceInfo[] {
    if (!isNativeSharedOutputPlatform(this.platform)) {
      this.logger(`[DeviceService] native output device enumeration is unavailable on ${this.platform}`);
      return [];
    }

    return this.getCachedDevices('shared', options);
  }

  listSharedDevicesAsync(options: DeviceListOptions = {}): Promise<AudioDeviceInfo[]> {
    if (!isNativeSharedOutputPlatform(this.platform)) {
      this.logger(`[DeviceService] native output device enumeration is unavailable on ${this.platform}`);
      return Promise.resolve([]);
    }

    return this.getCachedDevicesAsync('shared', options);
  }

  listAsioDevices(options: DeviceListOptions = {}): AudioDeviceInfo[] {
    if (!isAdvancedNativeOutputPlatform(this.platform)) {
      return [];
    }

    return this.getCachedDevices('asio', options);
  }

  listAsioDevicesAsync(options: DeviceListOptions = {}): Promise<AudioDeviceInfo[]> {
    if (!isAdvancedNativeOutputPlatform(this.platform)) {
      return Promise.resolve([]);
    }

    return this.getCachedDevicesAsync('asio', options);
  }

  private getCachedDevices(outputMode: AudioDeviceInfo['outputMode'], options: DeviceListOptions): AudioDeviceInfo[] {
    const now = Date.now();
    const cacheKey = this.createCacheKey(options);
    const cacheMap = outputMode === 'asio' ? this.asioCache : this.sharedCache;
    const cache = cacheMap.get(cacheKey) ?? null;
    const cacheTtlMs = outputMode === 'asio' ? this.asioCacheTtlMs : this.sharedCacheTtlMs;

    if (cache && now - cache.at < cacheTtlMs) {
      return [...cache.devices];
    }

    const devices = this.runDeviceList(this.createListArgs(outputMode, options), outputMode);
    const nextCache = { at: now, devices };

    cacheMap.set(cacheKey, nextCache);

    return [...devices];
  }

  private async getCachedDevicesAsync(outputMode: AudioDeviceInfo['outputMode'], options: DeviceListOptions): Promise<AudioDeviceInfo[]> {
    const now = Date.now();
    const cacheKey = this.createCacheKey(options);
    const cacheMap = outputMode === 'asio' ? this.asioCache : this.sharedCache;
    const pendingMap = outputMode === 'asio' ? this.asioPending : this.sharedPending;
    const cache = cacheMap.get(cacheKey) ?? null;
    const cacheTtlMs = outputMode === 'asio' ? this.asioCacheTtlMs : this.sharedCacheTtlMs;

    if (cache && now - cache.at < cacheTtlMs) {
      return [...cache.devices];
    }

    const currentPending = pendingMap.get(cacheKey) ?? null;
    if (currentPending) {
      const devices = await currentPending;
      return [...devices];
    }

    const args = this.createListArgs(outputMode, options);
    const pending = this.runDeviceListAsync(args, outputMode)
      .then((devices) => {
        const nextCache = { at: Date.now(), devices };
        cacheMap.set(cacheKey, nextCache);
        return devices;
      })
      .finally(() => {
        pendingMap.delete(cacheKey);
      });

    pendingMap.set(cacheKey, pending);

    const devices = await pending;
    return [...devices];
  }

  private createCacheKey(options: DeviceListOptions): string {
    return options.useJuceOutput === true ? 'juce' : 'native';
  }

  private createListArgs(outputMode: AudioDeviceInfo['outputMode'], options: DeviceListOptions): string[] {
    const args = outputMode === 'asio' ? ['-list', '-asio'] : ['-list'];

    if (options.useJuceOutput === true) {
      args.push('-juce-output');
    }

    return args;
  }

  private runDeviceList(args: string[], outputMode: AudioDeviceInfo['outputMode']): AudioDeviceInfo[] {
    const bin = this.hostBinary ?? (this.platform === process.platform ? resolveHostBinary() : null);

    if (!bin) {
      this.logger(`[DeviceService] echo-audio-host binary not found for ${outputMode} device enumeration`);
      return [];
    }

    try {
      const output = this.exec(bin, args, {
        timeout: 5000,
        encoding: 'utf-8',
      });

      const devices = this.parseDeviceListOutput(String(output), outputMode);

      if (outputMode === 'asio' && devices.length === 0) {
        this.logger(`[DeviceService] ASIO device enumeration returned no devices; host="${bin}" args="${args.join(' ')}"`);
      }

      return devices;
    } catch (error) {
      this.logDeviceListFailure(error, bin, args, outputMode);
      return [];
    }
  }

  private runDeviceListAsync(args: string[], outputMode: AudioDeviceInfo['outputMode']): Promise<AudioDeviceInfo[]> {
    const bin = this.hostBinary ?? (this.platform === process.platform ? resolveHostBinary() : null);

    if (!bin) {
      this.logger(`[DeviceService] echo-audio-host binary not found for ${outputMode} device enumeration`);
      return Promise.resolve([]);
    }

    return new Promise((resolve) => {
      this.execAsync(bin, args, { timeout: 5000, encoding: 'utf-8' }, (error, stdout, stderr) => {
        if (error) {
          this.logDeviceListFailure(Object.assign(error, { stderr, stdout }), bin, args, outputMode);
          resolve([]);
          return;
        }

        const devices = this.parseDeviceListOutput(String(stdout), outputMode);

        if (outputMode === 'asio' && devices.length === 0) {
          this.logger(`[DeviceService] ASIO device enumeration returned no devices; host="${bin}" args="${args.join(' ')}"`);
        }

        resolve(devices);
      });
    });
  }

  private parseDeviceListOutput(output: string, outputMode: AudioDeviceInfo['outputMode']): AudioDeviceInfo[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseDeviceListLine(line, outputMode))
      .filter((device): device is AudioDeviceInfo => device !== null);
  }

  private logDeviceListFailure(
    error: unknown,
    bin: string,
    args: string[],
    outputMode: AudioDeviceInfo['outputMode'],
  ): void {
    const details = error as { status?: unknown; code?: unknown; stderr?: unknown; stdout?: unknown; message?: unknown };
    const stderr = Buffer.isBuffer(details.stderr) ? details.stderr.toString('utf8') : String(details.stderr ?? '').trim();
    const stdout = Buffer.isBuffer(details.stdout) ? details.stdout.toString('utf8') : String(details.stdout ?? '').trim();
    const message = details.message ? String(details.message) : String(error);
    this.logger(
      `[DeviceService] ${outputMode} device enumeration failed; host="${bin}" args="${args.join(' ')}" status=${
        details.status ?? details.code ?? 'unknown'
      }; error="${message}"${stderr ? `; stderr="${stderr}"` : ''}${stdout ? `; stdout="${stdout}"` : ''}`,
    );
  }
}
