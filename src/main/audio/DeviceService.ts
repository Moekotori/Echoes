import { execFile, execFileSync } from 'node:child_process';
import type { AudioDeviceInfo } from './audioTypes';
import { resolveHostBinary } from './NativeOutputBridge';

export type DeviceServiceDependencies = {
  hostBinary?: string | null;
  execFileSync?: typeof execFileSync;
  execFile?: typeof execFile;
  logger?: (message: string) => void;
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
  private readonly logger: (message: string) => void;
  private readonly cacheTtlMs = 5000;
  private sharedCache: { at: number; devices: AudioDeviceInfo[] } | null = null;
  private asioCache: { at: number; devices: AudioDeviceInfo[] } | null = null;
  private sharedPending: Promise<AudioDeviceInfo[]> | null = null;
  private asioPending: Promise<AudioDeviceInfo[]> | null = null;

  constructor(dependencies: DeviceServiceDependencies = {}) {
    this.exec = dependencies.execFileSync ?? execFileSync;
    this.execAsync = dependencies.execFile ?? execFile;
    this.hostBinary = dependencies.hostBinary ?? null;
    this.logger = dependencies.logger ?? ((message) => console.warn(message));
  }

  listDevices(): AudioDeviceInfo[] {
    return [...this.listSharedDevices(), ...this.listAsioDevices()];
  }

  async listDevicesAsync(): Promise<AudioDeviceInfo[]> {
    const [sharedDevices, asioDevices] = await Promise.all([
      this.listSharedDevicesAsync(),
      this.listAsioDevicesAsync(),
    ]);
    return [...sharedDevices, ...asioDevices];
  }

  listSharedDevices(): AudioDeviceInfo[] {
    return this.getCachedDevices('shared');
  }

  listSharedDevicesAsync(): Promise<AudioDeviceInfo[]> {
    return this.getCachedDevicesAsync('shared');
  }

  listAsioDevices(): AudioDeviceInfo[] {
    return this.getCachedDevices('asio');
  }

  listAsioDevicesAsync(): Promise<AudioDeviceInfo[]> {
    return this.getCachedDevicesAsync('asio');
  }

  private getCachedDevices(outputMode: AudioDeviceInfo['outputMode']): AudioDeviceInfo[] {
    const now = Date.now();
    const cache = outputMode === 'asio' ? this.asioCache : this.sharedCache;

    if (cache && now - cache.at < this.cacheTtlMs) {
      return [...cache.devices];
    }

    const devices = this.runDeviceList(outputMode === 'asio' ? ['-list', '-asio'] : ['-list'], outputMode);
    const nextCache = { at: now, devices };

    if (outputMode === 'asio') {
      this.asioCache = nextCache;
    } else {
      this.sharedCache = nextCache;
    }

    return [...devices];
  }

  private async getCachedDevicesAsync(outputMode: AudioDeviceInfo['outputMode']): Promise<AudioDeviceInfo[]> {
    const now = Date.now();
    const cache = outputMode === 'asio' ? this.asioCache : this.sharedCache;

    if (cache && now - cache.at < this.cacheTtlMs) {
      return [...cache.devices];
    }

    const currentPending = outputMode === 'asio' ? this.asioPending : this.sharedPending;
    if (currentPending) {
      const devices = await currentPending;
      return [...devices];
    }

    const args = outputMode === 'asio' ? ['-list', '-asio'] : ['-list'];
    const pending = this.runDeviceListAsync(args, outputMode)
      .then((devices) => {
        const nextCache = { at: Date.now(), devices };
        if (outputMode === 'asio') {
          this.asioCache = nextCache;
        } else {
          this.sharedCache = nextCache;
        }
        return devices;
      })
      .finally(() => {
        if (outputMode === 'asio') {
          this.asioPending = null;
        } else {
          this.sharedPending = null;
        }
      });

    if (outputMode === 'asio') {
      this.asioPending = pending;
    } else {
      this.sharedPending = pending;
    }

    const devices = await pending;
    return [...devices];
  }

  private runDeviceList(args: string[], outputMode: AudioDeviceInfo['outputMode']): AudioDeviceInfo[] {
    const bin = this.hostBinary ?? resolveHostBinary();

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
    const bin = this.hostBinary ?? resolveHostBinary();

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
