import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';

export type AirPlayMdnsAdvertisement = {
  name: string;
  address: string;
  mac: string;
  port: number;
  model: string;
};

const mdnsAddress = '224.0.0.251';
const mdnsPort = 5353;
const raopServiceName = '_raop._tcp.local';
const serviceEnumerator = '_services._dns-sd._udp.local';
const recordClassInternet = 1;
const recordClassCacheFlush = 0x8001;
const classicAirPlayVersion = '130.14';

const cleanMac = (mac: string): string => {
  const cleaned = mac.replace(/[^a-fA-F0-9]/gu, '').toUpperCase();
  return cleaned.length === 12 ? cleaned : '024543484F00';
};

const encodeName = (name: string): Buffer => {
  const labels = name.replace(/\.$/u, '').split('.');
  return Buffer.concat([
    ...labels.map((label) => {
      const content = Buffer.from(label, 'utf8');
      return Buffer.concat([Buffer.from([content.length]), content]);
    }),
    Buffer.from([0]),
  ]);
};

const encodeTxt = (values: string[]): Buffer =>
  Buffer.concat(values.map((value) => {
    const content = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from([Math.min(content.length, 255)]), content.subarray(0, 255)]);
  }));

const encodeRecord = (name: string, type: number, recordClass: number, ttl: number, data: Buffer): Buffer => {
  const header = Buffer.allocUnsafe(10);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(recordClass, 2);
  header.writeUInt32BE(ttl, 4);
  header.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), header, data]);
};

const readName = (packet: Buffer, startOffset: number, depth = 0): { name: string; offset: number } | null => {
  if (depth > 8) {
    return null;
  }

  const labels: string[] = [];
  let offset = startOffset;
  let nextOffset = startOffset;
  let jumped = false;

  while (offset < packet.length) {
    const length = packet[offset];
    if (length === 0) {
      offset += 1;
      if (!jumped) {
        nextOffset = offset;
      }
      return { name: labels.join('.').toLowerCase(), offset: nextOffset };
    }

    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) {
        return null;
      }
      const pointer = ((length & 0x3f) << 8) | packet[offset + 1];
      const pointed = readName(packet, pointer, depth + 1);
      if (!pointed) {
        return null;
      }
      labels.push(pointed.name);
      if (!jumped) {
        nextOffset = offset + 2;
      }
      jumped = true;
      return { name: labels.join('.').toLowerCase(), offset: nextOffset };
    }

    offset += 1;
    if (offset + length > packet.length) {
      return null;
    }
    labels.push(packet.subarray(offset, offset + length).toString('utf8'));
    offset += length;
  }

  return null;
};

const parseQuestionNames = (packet: Buffer): Set<string> => {
  const names = new Set<string>();
  if (packet.length < 12) {
    return names;
  }

  const questionCount = packet.readUInt16BE(4);
  let offset = 12;
  for (let index = 0; index < questionCount; index += 1) {
    const result = readName(packet, offset);
    if (!result || result.offset + 4 > packet.length) {
      break;
    }
    names.add(result.name);
    offset = result.offset + 4;
  }
  return names;
};

export class AirPlayMdnsAdvertiser {
  private socket: Socket | null = null;
  private advertisement: AirPlayMdnsAdvertisement | null = null;
  private announceTimers: NodeJS.Timeout[] = [];

  async start(advertisement: AirPlayMdnsAdvertisement): Promise<void> {
    await this.stop(false);
    this.advertisement = advertisement;
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;

    socket.on('message', (message, remote) => this.handleMessage(message, remote));

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        socket.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        socket.off('error', onError);
        try {
          socket.addMembership(mdnsAddress, advertisement.address);
          socket.setMulticastInterface(advertisement.address);
          socket.setMulticastTTL(255);
          socket.setMulticastLoopback(true);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        resolve();
      };
      socket.once('error', onError);
      socket.once('listening', onListening);
      socket.bind(mdnsPort);
    });

    this.announce(false);
    this.announceTimers = [250, 1000, 3000].map((delay) => setTimeout(() => this.announce(false), delay));
  }

  async stop(sendGoodbye = true): Promise<void> {
    for (const timer of this.announceTimers) {
      clearTimeout(timer);
    }
    this.announceTimers = [];
    if (sendGoodbye) {
      this.announce(true);
    }
    const socket = this.socket;
    this.socket = null;
    this.advertisement = null;
    if (!socket) {
      return;
    }
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  private handleMessage(message: Buffer, remote: RemoteInfo): void {
    const advertisement = this.advertisement;
    if (!advertisement) {
      return;
    }

    const names = parseQuestionNames(message);
    const raopInstance = this.raopInstanceName(advertisement).toLowerCase();
    const hostName = this.hostName(advertisement).toLowerCase();
    if (
      names.has(raopServiceName) ||
      names.has(serviceEnumerator) ||
      names.has(raopInstance) ||
      names.has(hostName)
    ) {
      this.announce(false);
      this.announce(false, { address: remote.address, port: remote.port });
    }
  }

  private announce(goodbye: boolean, target?: { address: string; port: number }): void {
    const socket = this.socket;
    const advertisement = this.advertisement;
    if (!socket || !advertisement) {
      return;
    }

    const packet = this.createPacket(advertisement, goodbye ? 0 : 120);
    socket.send(packet, 0, packet.length, target?.port ?? mdnsPort, target?.address ?? mdnsAddress);
  }

  private createPacket(advertisement: AirPlayMdnsAdvertisement, ttl: number): Buffer {
    const mac = cleanMac(advertisement.mac);
    const raopInstance = this.raopInstanceName(advertisement);
    const hostName = this.hostName(advertisement);
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0, 0);
    header.writeUInt16BE(0x8400, 2);
    header.writeUInt16BE(0, 4);
    header.writeUInt16BE(5, 6);
    header.writeUInt16BE(0, 8);
    header.writeUInt16BE(0, 10);

    const srvData = Buffer.concat([
      Buffer.from([0, 0, 0, 0, (advertisement.port >> 8) & 0xff, advertisement.port & 0xff]),
      encodeName(hostName),
    ]);
    const addressData = Buffer.from(advertisement.address.split('.').map((part) => Number(part) & 0xff));
    const raopTxtData = encodeTxt([
      `am=${advertisement.model}`,
      'tp=UDP',
      'sm=false',
      'sv=false',
      'ek=1',
      'et=0,1',
      'md=0,1,2',
      'cn=0,1',
      'ch=2',
      'pw=false',
      'sf=0x4',
      'ss=16',
      'sr=44100',
      'vn=3',
      `vs=${classicAirPlayVersion}`,
      'txtvers=1',
    ]);

    return Buffer.concat([
      header,
      encodeRecord(serviceEnumerator, 12, recordClassInternet, ttl, encodeName(raopServiceName)),
      encodeRecord(raopServiceName, 12, recordClassInternet, ttl, encodeName(raopInstance)),
      encodeRecord(raopInstance, 33, recordClassCacheFlush, ttl, srvData),
      encodeRecord(raopInstance, 16, recordClassCacheFlush, ttl, raopTxtData),
      encodeRecord(hostName, 1, recordClassCacheFlush, ttl, addressData),
    ]);
  }

  private raopInstanceName(advertisement: AirPlayMdnsAdvertisement): string {
    return `${cleanMac(advertisement.mac)}@${advertisement.name}.${raopServiceName}`;
  }

  private hostName(advertisement: AirPlayMdnsAdvertisement): string {
    return `${cleanMac(advertisement.mac)}.local`;
  }
}
