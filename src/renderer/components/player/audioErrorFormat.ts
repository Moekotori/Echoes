const nonActionableAudioErrorPatterns = [
  /^Desktop bridge unavailable\b/u,
  /\beq_control_(?:closed|disconnected)\b/u,
  /\beq_control_sync_skipped\b/u,
  /\baudio_session_run_cancelled\b/u,
];

export const shouldSuppressAudioHostError = (error: string | null | undefined): boolean => {
  if (!error) {
    return true;
  }

  return nonActionableAudioErrorPatterns.some((pattern) => pattern.test(error));
};

export const formatAudioHostError = (error: string | null | undefined): string | null => {
  if (shouldSuppressAudioHostError(error)) {
    return null;
  }

  if (!error) {
    return null;
  }

  if (/\bdevice_initialize_timeout\b/u.test(error)) {
    return '设备驱动响应过慢,可能是 USB DAC 异常。建议重新插拔 USB,或在设置里点"重启音频引擎"。';
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
