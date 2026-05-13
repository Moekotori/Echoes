import { EventEmitter } from 'node:events';
import type { SmtcCommand, SmtcEnabledActions, SmtcPlaybackState, SmtcService, SmtcTrackMetadata } from './SmtcService';

type SmtcLogger = {
  warn: (message: string, payload?: unknown) => void;
  info: (message: string, payload?: unknown) => void;
};

const defaultLogger: SmtcLogger = {
  warn: (message, payload) => console.warn(message, payload ?? ''),
  info: () => undefined,
};

export class WindowsSmtcService implements SmtcService {
  private readonly commands = new EventEmitter();
  private initialized = false;

  constructor(private readonly logger: SmtcLogger = defaultLogger) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    // TODO: Wire a verified Electron-main-process Windows SMTC bridge here.
    // The project currently has no stable SMTC native dependency; keeping this
    // class isolated lets Windows builds fall back safely until a bridge is chosen.
    this.logger.info('[SMTC] Windows SMTC service initialized in no-op bridge mode');
  }

  dispose(): void {
    this.commands.removeAllListeners();
    this.initialized = false;
  }

  setPlaybackState(state: SmtcPlaybackState): void {
    void state;
    // TODO: Forward playback state to the Windows SMTC bridge.
  }

  setMetadata(metadata: SmtcTrackMetadata): void {
    void metadata;
    // TODO: Forward title, artist, album and coverPath to the Windows SMTC bridge.
  }

  setTimeline(positionSeconds: number, durationSeconds: number): void {
    void positionSeconds;
    void durationSeconds;
    // TODO: Forward position/duration to the Windows SMTC bridge. Seek is intentionally not supported yet.
  }

  setEnabledActions(actions: SmtcEnabledActions): void {
    void actions;
    // TODO: Enable play/pause/previous/next buttons on the Windows SMTC bridge.
  }

  onCommand(handler: (command: SmtcCommand) => void): () => void {
    this.commands.on('command', handler);
    return () => this.commands.off('command', handler);
  }

  protected emitCommand(command: SmtcCommand): void {
    this.commands.emit('command', command);
  }
}
