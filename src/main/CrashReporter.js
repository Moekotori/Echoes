import { app, crashReporter } from 'electron'
import fs from 'fs'
import { join } from 'path'
import os from 'os'

const MAX_RECENT_RENDERER_EVENTS = 80
const recentRendererEvents = []

function getCrashDir() {
  const isDev = !app.isPackaged
  return isDev
    ? join(process.cwd(), 'crash-reports')
    : join(app.getPath('userData'), 'crash-reports')
}

function ensureCrashDir() {
  const dir = getCrashDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function formatTimestamp() {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function limitString(value, max = 6000) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}\n...<truncated ${text.length - max} chars>` : text
}

function formatValue(value) {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return limitString(value)
  if (value instanceof Error) return limitString(value.stack || value.message || String(value))
  try {
    return limitString(JSON.stringify(value, null, 2))
  } catch {
    return limitString(String(value))
  }
}

function getSystemInfo() {
  return {
    timestamp: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    hostname: os.hostname(),
    totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
    freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
    cpuModel: os.cpus()?.[0]?.model || '',
    cpuCount: os.cpus()?.length || 0,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    appVersion: app.getVersion?.() || '',
    appPath: app.getAppPath?.() || '',
    userData: app.getPath?.('userData') || '',
    pid: process.pid,
    uptime: `${Math.round(process.uptime())}s`
  }
}

function getProcessInfo() {
  const memory = process.memoryUsage()
  const resourceUsage = typeof process.resourceUsage === 'function' ? process.resourceUsage() : null
  return {
    pid: process.pid,
    ppid: process.ppid,
    execPath: process.execPath,
    cwd: process.cwd(),
    argv: process.argv,
    versions: process.versions,
    memoryUsageMb: Object.fromEntries(
      Object.entries(memory).map(([key, value]) => [key, Math.round(value / 1024 / 1024)])
    ),
    resourceUsage
  }
}

export function recordRendererEvent(kind, payload = {}) {
  const event = {
    at: new Date().toISOString(),
    kind: String(kind || 'event'),
    payload: safeJson(payload, { value: String(payload) })
  }
  recentRendererEvents.push(event)
  while (recentRendererEvents.length > MAX_RECENT_RENDERER_EVENTS) {
    recentRendererEvents.shift()
  }
}

export function getRecentRendererEvents() {
  return recentRendererEvents.slice()
}

function buildContext(getAudioEngineStatus, getExtraContext, extra = {}) {
  const context = { ...extra }
  if (typeof getAudioEngineStatus === 'function') {
    try {
      context.audioEngineStatus = getAudioEngineStatus()
    } catch (error) {
      context.audioEngineStatusError = error?.message || String(error)
    }
  }
  if (typeof getExtraContext === 'function') {
    try {
      Object.assign(context, getExtraContext())
    } catch (error) {
      context.extraContextError = error?.message || String(error)
    }
  }
  return context
}

function writeCrashReport(type, error, extraContext = {}) {
  try {
    const dir = ensureCrashDir()
    const ts = formatTimestamp()
    const fileName = `crash_${type}_${ts}.log`
    const filePath = join(dir, fileName)

    const report = [
      '='.repeat(60),
      'ECHO CRASH REPORT',
      '='.repeat(60),
      '',
      `TYPE       : ${type}`,
      `TIMESTAMP  : ${new Date().toISOString()}`,
      '',
      '--- SYSTEM INFO ---',
      ...Object.entries(getSystemInfo()).map(([k, v]) => `  ${k.padEnd(16)}: ${v}`),
      '',
      '--- PROCESS INFO ---',
      formatValue(getProcessInfo()),
      '',
      '--- ERROR ---',
      `  Message  : ${error?.message || String(error)}`,
      `  Name     : ${error?.name || 'Unknown'}`,
      '',
      '--- STACK TRACE ---',
      error?.stack || '  (no stack available)',
      ''
    ]

    if (Object.keys(extraContext).length > 0) {
      report.push('--- CONTEXT ---')
      for (const [k, v] of Object.entries(extraContext)) {
        report.push(`  ${k}: ${formatValue(v)}`)
      }
      report.push('')
    }

    if (recentRendererEvents.length > 0) {
      report.push('--- RECENT RENDERER EVENTS ---')
      report.push(formatValue(recentRendererEvents))
      report.push('')
    }

    report.push('='.repeat(60))

    fs.writeFileSync(filePath, report.join('\n'), 'utf-8')
    console.error(`[CrashReporter] Report saved: ${filePath}`)
    return filePath
  } catch (e) {
    console.error('[CrashReporter] Failed to write crash report:', e)
    return null
  }
}

export function initCrashReporter(getAudioEngineStatus = null, options = {}) {
  const getExtraContext = typeof options.getExtraContext === 'function' ? options.getExtraContext : null
  const onRendererGone = typeof options.onRendererGone === 'function' ? options.onRendererGone : null

  try {
    crashReporter.start({
      productName: 'ECHO',
      companyName: 'ECHO',
      submitURL: '',
      uploadToServer: false,
      ignoreSystemCrashHandler: false
    })
    console.log('[CrashReporter] Native crash reporter initialized')
  } catch (e) {
    console.warn('[CrashReporter] Native crashReporter init failed:', e.message)
  }

  process.on('uncaughtException', (error) => {
    writeCrashReport('UncaughtException', error, buildContext(getAudioEngineStatus, getExtraContext))
    setTimeout(() => process.exit(1), 500)
  })

  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    writeCrashReport(
      'UnhandledRejection',
      error,
      buildContext(getAudioEngineStatus, getExtraContext, {
        promise: String(promise)
      })
    )
  })

  app.on('render-process-gone', (event, webContents, details) => {
    const context = buildContext(getAudioEngineStatus, getExtraContext, {
      exitCode: details.exitCode,
      reason: details.reason,
      url: webContents.getURL(),
      rendererProcessId:
        typeof webContents.getOSProcessId === 'function' ? webContents.getOSProcessId() : null,
      webContentsId: webContents.id,
      isCrashed: typeof webContents.isCrashed === 'function' ? webContents.isCrashed() : null
    })
    const reportPath = writeCrashReport(
      'RendererCrash',
      new Error(`Renderer gone: ${details.reason}`),
      context
    )
    if (onRendererGone) {
      try {
        onRendererGone({ webContents, details, reportPath, context })
      } catch (error) {
        writeCrashReport(
          'RendererCrashHandlerError',
          error,
          buildContext(getAudioEngineStatus, getExtraContext, { reportPath })
        )
      }
    }
  })

  app.on('gpu-process-crashed', (event, killed) => {
    writeCrashReport(
      'GPUCrash',
      new Error(`GPU process crashed (killed: ${killed})`),
      buildContext(getAudioEngineStatus, getExtraContext)
    )
  })

  console.log(`[CrashReporter] All handlers registered. Reports -> ${getCrashDir()}`)
}

export function logError(label, error, context = {}) {
  writeCrashReport(`ManualLog_${label}`, error, context)
}

export { getCrashDir, writeCrashReport }
