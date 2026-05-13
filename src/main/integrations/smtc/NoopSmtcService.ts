import { EventEmitter } from 'node:events';
import type { SmtcCommand, SmtcEnabledActions, SmtcPlaybackState, SmtcService, SmtcTrackMetadata } from './SmtcService';

export class NoopSmtcService implements SmtcService {
  private readonly commands = new EventEmitter();

  initialize(): void {
    // Non-Windows platforms and unavailable bridges intentionally do nothing.
  }

  dispose(): void {
    this.commands.removeAllListeners();
  }

  setPlaybackState(state: SmtcPlaybackState): void {
    void state;
    // no-op
  }

  setMetadata(metadata: SmtcTrackMetadata): void {
    void metadata;
    // no-op
  }

  setTimeline(positionSeconds: number, durationSeconds: number): void {
    void positionSeconds;
    void durationSeconds;
    // no-op
  }

  setEnabledActions(actions: SmtcEnabledActions): void {
    void actions;
    // no-op
  }

  onCommand(handler: (command: SmtcCommand) => void): () => void {
    this.commands.on('command', handler);
    return () => this.commands.off('command', handler);
  }
}
