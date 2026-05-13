import type { LibraryScanStatus } from '../../shared/types/library';

export type ScanStatusByFolder = Record<string, LibraryScanStatus>;

let sharedScanStatuses: ScanStatusByFolder = {};
const scanStatusSubscribers = new Set<(statuses: ScanStatusByFolder) => void>();

const cloneScanStatuses = (): ScanStatusByFolder => ({ ...sharedScanStatuses });

const emitSharedScanStatuses = (): void => {
  const snapshot = cloneScanStatuses();
  for (const subscriber of scanStatusSubscribers) {
    subscriber(snapshot);
  }
};

export const getLibraryScanStatuses = (): ScanStatusByFolder => cloneScanStatuses();

export const rememberLibraryScanStatus = (status: LibraryScanStatus): void => {
  sharedScanStatuses = {
    ...sharedScanStatuses,
    [status.folderId]: status,
  };
  emitSharedScanStatuses();
};

export const forgetLibraryScanStatus = (folderId: string): void => {
  const next = { ...sharedScanStatuses };
  delete next[folderId];
  sharedScanStatuses = next;
  emitSharedScanStatuses();
};

export const subscribeLibraryScanStatuses = (
  subscriber: (statuses: ScanStatusByFolder) => void,
): (() => void) => {
  scanStatusSubscribers.add(subscriber);
  subscriber(cloneScanStatuses());

  return () => {
    scanStatusSubscribers.delete(subscriber);
  };
};

export const resetLibraryScanSessionForTests = (): void => {
  sharedScanStatuses = {};
  emitSharedScanStatuses();
};
