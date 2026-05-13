import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrashRecoveryDialogForTests, showCrashRecoveryDialog } from './CrashRecoveryDialog';

const mocks = vi.hoisted(() => ({
  exit: vi.fn(),
  openDiagnosticsFolder: vi.fn(),
  relaunch: vi.fn(),
  showMessageBox: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    relaunch: mocks.relaunch,
    exit: mocks.exit,
  },
  dialog: {
    showMessageBox: mocks.showMessageBox,
  },
}));

vi.mock('./CrashReportService', () => ({
  getCrashReportService: () => ({
    getLogger: () => ({
      error: vi.fn(),
    }),
    openDiagnosticsFolder: mocks.openDiagnosticsFolder,
  }),
}));

describe('CrashRecoveryDialog', () => {
  beforeEach(() => {
    resetCrashRecoveryDialogForTests();
    mocks.relaunch.mockReset();
    mocks.exit.mockReset();
    mocks.showMessageBox.mockReset();
    mocks.openDiagnosticsFolder.mockReset();
  });

  it('restarts the app when the restart button is chosen', async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 0 });

    await showCrashRecoveryDialog('renderer', 'Renderer process gone: crashed');

    expect(mocks.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ buttons: ['重启 ECHO', '打开 crash report', '忽略'] }));
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
    expect(mocks.exit).toHaveBeenCalledWith(0);
  });

  it('opens the diagnostics folder when crash report is chosen', async () => {
    mocks.showMessageBox.mockResolvedValue({ response: 1 });

    await showCrashRecoveryDialog('main', 'Boom');

    expect(mocks.openDiagnosticsFolder).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
