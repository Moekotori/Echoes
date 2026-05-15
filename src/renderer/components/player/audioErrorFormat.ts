export const formatAudioHostError = (error: string | null | undefined): string | null => {
  if (!error) {
    return null;
  }

  if (error.includes('echo-audio-host timeout_waiting_for_ready')) {
    return '音频输出启动超时，可能是驱动初始化太慢、设备被占用，或采样率/缓冲设置被拒绝。';
  }

  if (error.includes('echo-audio-host spawn_error:')) {
    return '音频引擎无法启动，请检查 native host 是否存在或被安全软件拦截。';
  }

  if (/\becho-audio-host (exit_code_\d+|exit_signal_|exclusive_denied)/.test(error)) {
    return '音频输出设备启动失败，可能是设备拒绝当前输出模式、采样率或缓冲设置。';
  }

  return error;
};
