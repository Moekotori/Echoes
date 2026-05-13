import type { SmtcCommand, SmtcEnabledActions, SmtcPlaybackState, SmtcTrackMetadata } from '../../../shared/types/smtc';

export type { SmtcCommand, SmtcEnabledActions, SmtcPlaybackState, SmtcTrackMetadata };

export interface SmtcService {
  initialize(): void | Promise<void>;
  dispose(): void;
  setPlaybackState(state: SmtcPlaybackState): void | Promise<void>;
  setMetadata(metadata: SmtcTrackMetadata): void | Promise<void>;
  setTimeline(positionSeconds: number, durationSeconds: number): void | Promise<void>;
  setEnabledActions(actions: SmtcEnabledActions): void | Promise<void>;
  onCommand(handler: (command: SmtcCommand) => void): () => void;
}
