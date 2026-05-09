import assert from 'node:assert/strict'
import test from 'node:test'

import { logLine } from '../../src/main/utils/logLine.js'

test('logLine keeps Unicode text on the default logging path', () => {
  const originalConsoleLog = console.log
  const originalEnv = process.env.ECHOES_LOG_CP936
  const lines = []

  try {
    delete process.env.ECHOES_LOG_CP936
    console.log = (line) => {
      lines.push(line)
    }

    logLine('path=D:\\桌面媒体\\KAERU.m4a 操作频繁')
  } finally {
    console.log = originalConsoleLog
    if (originalEnv === undefined) {
      delete process.env.ECHOES_LOG_CP936
    } else {
      process.env.ECHOES_LOG_CP936 = originalEnv
    }
  }

  assert.deepEqual(lines, ['path=D:\\桌面媒体\\KAERU.m4a 操作频繁'])
})
