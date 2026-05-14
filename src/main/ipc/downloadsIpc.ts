import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { CreateDownloadUrlJobOptions, DownloadJob, DownloadSettings, DownloadToolsStatus } from '../../shared/types/downloads';
import { getDownloadService } from '../downloads/DownloadService';

export const registerDownloadsIpc = (): void => {
  const service = getDownloadService();

  service.on('jobs-updated', (jobs: DownloadJob[]) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.DownloadsJobsUpdated, jobs);
    }
  });

  ipcMain.handle(IpcChannels.DownloadsGetJobs, (): DownloadJob[] => service.getJobs());
  ipcMain.handle(IpcChannels.DownloadsCreateUrlJob, (_event, url: unknown, options?: CreateDownloadUrlJobOptions): DownloadJob => {
    if (typeof url !== 'string') {
      throw new Error('download URL must be a string');
    }

    return service.createUrlJob(url, options);
  });
  ipcMain.handle(IpcChannels.DownloadsCancelJob, (_event, jobId: unknown): DownloadJob | null => service.cancelJob(String(jobId)));
  ipcMain.handle(IpcChannels.DownloadsClearCompleted, (): DownloadJob[] => service.clearCompleted());
  ipcMain.handle(IpcChannels.DownloadsGetSettings, (): DownloadSettings => service.getSettings());
  ipcMain.handle(IpcChannels.DownloadsSetSettings, (_event, patch: Partial<DownloadSettings>): DownloadSettings => service.setSettings(patch));
  ipcMain.handle(IpcChannels.DownloadsChooseOutputDirectory, async (): Promise<DownloadSettings | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择下载文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return service.setSettings({ outputDirectory: result.filePaths[0] });
  });
  ipcMain.handle(IpcChannels.DownloadsCheckTools, (): Promise<DownloadToolsStatus> => service.checkTools());
};
