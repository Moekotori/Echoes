import { app, dialog } from 'electron';
import { getCrashReportService } from './CrashReportService';

type CrashRecoveryReason = 'main' | 'renderer';

let recoveryDialogVisible = false;

const restartApp = (): void => {
  app.relaunch();
  app.exit(0);
};

export const showCrashRecoveryDialog = async (reason: CrashRecoveryReason, message: string): Promise<void> => {
  if (recoveryDialogVisible) {
    return;
  }

  recoveryDialogVisible = true;

  try {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'ECHO crash report',
      message: reason === 'renderer' ? 'ECHO 界面进程异常退出。' : 'ECHO 遇到了一个主进程异常。',
      detail: `${message}\n\nCrash report 已保存在本机。你可以重启 ECHO，或打开日志目录后把诊断包导出给开发者排查。`,
      buttons: ['重启 ECHO', '打开 crash report', '忽略'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (result.response === 0) {
      restartApp();
      return;
    }

    if (result.response === 1) {
      await getCrashReportService().openDiagnosticsFolder();
    }
  } catch (error) {
    getCrashReportService().getLogger()?.error('crash', 'failed to show crash recovery dialog', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    recoveryDialogVisible = false;
  }
};

export const resetCrashRecoveryDialogForTests = (): void => {
  recoveryDialogVisible = false;
};
