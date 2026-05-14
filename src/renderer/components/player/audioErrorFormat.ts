export const formatAudioHostError = (error: string | null | undefined): string | null => {
  if (!error) {
    return null;
  }

  if (error.includes('echo-audio-host timeout_waiting_for_ready')) {
    return '音频引擎启动超时，已尝试默认输出';
  }

  if (error.includes('echo-audio-host spawn_error:')) {
    return '音频引擎无法启动，请检查安装文件';
  }

  if (/\becho-audio-host (exit_code_\d+|exit_signal_|exclusive_denied)/.test(error)) {
    return '音频输出设备启动失败，已尝试默认输出';
  }

  return error;
};
