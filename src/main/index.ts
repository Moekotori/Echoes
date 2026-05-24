import { app } from 'electron';
import { registerCrashHandlers } from './diagnostics/crashHandlers';
import { registerAppLifecycle } from './app/lifecycle';
import { startDevApiServer } from './app/devApiServer';
import { registerIpc } from './ipc/registerIpc';
import { registerCoverProtocolScheme } from './protocol/coverProtocol';
import { initializeProtectedUserDataPath } from './app/dataProtection';
import { isLibraryRecoveryMode } from './app/libraryRecoveryMode';
import { initializeDevConsoleCapture } from './diagnostics/DevConsoleService';
import { markStartupStage, openEarlySafeModeShellIfEnabled } from './diagnostics/StartupDiagnostics';

markStartupStage('main:module-loaded');
const protectedUserDataPath = initializeProtectedUserDataPath();
markStartupStage('main:user-data-path-initialized');
openEarlySafeModeShellIfEnabled({
  appVersion: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userDataPath: protectedUserDataPath,
});
registerCrashHandlers();
markStartupStage('main:crash-handlers-registered');
initializeDevConsoleCapture();
markStartupStage('main:dev-console-capture-initialized');
registerCoverProtocolScheme();
markStartupStage('main:cover-protocol-scheme-registered');
registerIpc();
markStartupStage('main:ipc-registered');
if (!isLibraryRecoveryMode()) {
  startDevApiServer();
  markStartupStage('main:dev-api-server-started');
} else {
  markStartupStage('main:dev-api-server-skipped', { reason: 'library-recovery-mode' });
}
registerAppLifecycle();
markStartupStage('main:lifecycle-registered');
