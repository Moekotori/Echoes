import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import { Transform, Writable } from 'stream'
import { createRequire } from 'module'
import {
  NativeAudioBridge,
  isNativeBridgeAvailable,
  listNativeDevices
} from './NativeAudioBridge.js'
import { createEqFloatProcessor } from './eqFloatProcessor.js'
import { getResolvedFfmpegStaticPath } from '../utils/resolveFfmpegStaticPath.js'
import {
  getFfmpegAudioInfo,
  shouldPreferFfmpegAudioInfo,
  shouldUseFfmpegAudioInfo
} from '../utils/ffmpegProbeAudioInfo.js'
import { logLine } from '../utils/logLine.js'
import { VstBridge } from './VstBridge.js'
import { getCueAudioPath, parseCueVirtualPath, toCueAbsoluteTime } from '../../shared/cueTracks.mjs'

const resolvedFfmpeg = getResolvedFfmpegStaticPath()
ffmpeg.setFfmpegPath(resolvedFfmpeg)

const MAX_FILE_INFO_CACHE_ENTRIES = 512
const MAX_WASAPI_EXCLUSIVE_PCM_SAMPLE_RATE = 768000
const DSD_PCM_GAIN_DB = 6
const require = createRequire(import.meta.url)
let naudiodonApi = null
let naudiodonLoadFailed = false

function disableNaudiodonSegfaultHandler() {
  try {
    const handlerPath = require.resolve('segfault-handler')
    if (!require.cache[handlerPath]) {
      require.cache[handlerPath] = {
        id: handlerPath,
        filename: handlerPath,
        loaded: true,
        exports: {
          registerHandler: () => {}
        }
      }
    }
  } catch {
    /* optional dependency guard */
  }
}

function loadNaudiodon() {
  if (naudiodonApi || naudiodonLoadFailed) return naudiodonApi
  try {
    disableNaudiodonSegfaultHandler()
    naudiodonApi = require('naudiodon')
    return naudiodonApi
  } catch (e) {
    naudiodonLoadFailed = true
    console.warn('[AudioEngine] naudiodon fallback unavailable:', e?.message || e)
    return null
  }
}

function trimMapCache(cache, maxEntries) {
  if (!(cache instanceof Map) || cache.size <= maxEntries) return
  while (cache.size > maxEntries) {
    const firstKey = cache.keys().next().value
    if (firstKey === undefined) break
    cache.delete(firstKey)
  }
}

function getLocalFileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size || 0
  } catch {
    return 0
  }
}

function normalizeStreamUri(uri) {
  if (!uri || typeof uri !== 'string') return uri
  let s = uri.trim()
  if (!/^https?:\/\//i.test(s)) return s
  return s.replace(/&amp;/gi, '&')
}

const NETEASE_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 NeteaseMusic/9.0.0'
const NETEASE_HEADERS = 'Referer: https://music.163.com/\r\nOrigin: https://music.163.com\r\n'

const AUTOMIX_MIN_DURATION_SEC = 1.2
const AUTOMIX_MAX_DURATION_SEC = 12
let ffmpegThreadSettingLogged = false

function getFfmpegThreadArgs() {
  if (process.env.ECHO_DISABLE_FFMPEG_THREADS === '1') return []
  const raw = Number(process.env.ECHO_FFMPEG_THREADS)
  const threads = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0
  return ['-threads', String(threads)]
}

function applyFfmpegInputOptions(command, options = []) {
  const threadArgs = getFfmpegThreadArgs()
  const args = [...threadArgs, ...options]
  if (args.length > 0) command.inputOptions(args)
  const shouldLog =
    process.env.ECHO_DEBUG_FFMPEG_THREADS === '1' || ffmpegThreadSettingLogged === false
  if (shouldLog) {
    ffmpegThreadSettingLogged = true
    const threadLabel = threadArgs.length > 0 ? threadArgs[1] : 'disabled'
    logLine(`[AudioEngine] FFmpeg decoder threads: ${threadLabel}`)
  }
  return command
}

function isNeteaseStreamUrl(uri) {
  return /music\.163\.com|126\.net|netease|interface\.music\.163/i.test(uri)
}

function escapeUnicodeForLog(value) {
  return String(value || '')
}

function formatPathForLog(filePath) {
  const fullPath = String(filePath || '')
  const fileName = fullPath.split(/[/\\]/).filter(Boolean).pop() || fullPath
  return `file=${escapeUnicodeForLog(fileName)} | path=${escapeUnicodeForLog(fullPath)}`
}

/**
 * AudioProcessor — volume + safe buffer copy + byte-count progress (legacy path only).
 *
 * In native-bridge mode the byte-count progress is ignored; position comes from
 * the output-side frame counter reported by the child process.
 */
class AudioProcessor extends Transform {
  constructor(options) {
    super(options)
    this.engine = options.engine
    this.targetSampleRate = options.targetSampleRate
    this.channels = options.channels
    this.playbackRate = options.playbackRate
    this.startTime = options.startTime
    this.bytesWritten = 0
  }

  _transform(chunk, encoding, callback) {
    if (!this.engine.isPlaying) return callback()

    const engine = this.engine
    const eqProc = engine._bridge ? engine._eqProcessor : null
    const eqActive = !!(eqProc && !eqProc.bypass)
    const automixActive = !!engine._automixState && !engine._automixState.cancelled
    const vol = engine.volume
    const volActive = Math.abs(vol - 1) > 1e-6

    // Pass-through fast path: when no DSP stage needs to mutate the PCM we can
    // forward the FFmpeg buffer to the output sink without allocating a new
    // ArrayBuffer / Float32Array / Buffer per chunk. Hi-res streams (96k/192k
    // / DSD-to-PCM) hit this dozens of times per second, and the avoided
    // allocations remove a steady source of GC pressure on the main thread.
    if (!eqActive && !automixActive && !volActive) {
      if (engine._outputSink && engine.isPlaying) {
        this.push(chunk)
      }
      this.bytesWritten += chunk.byteLength
      if (!engine._bridge) {
        const secondsProcessed =
          (this.bytesWritten / (this.targetSampleRate * this.channels * 4)) * this.playbackRate
        engine.playbackTime = Math.max(0, this.startTime + secondsProcessed)
      }
      return callback()
    }

    if (!eqActive && !automixActive && volActive) {
      const samples = new Float32Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 4)
      for (let i = 0; i < samples.length; i++) {
        samples[i] *= vol
      }
      if (engine._outputSink && engine.isPlaying) {
        this.push(chunk)
      }
      this.bytesWritten += chunk.byteLength
      if (!engine._bridge) {
        const secondsProcessed =
          (this.bytesWritten / (this.targetSampleRate * this.channels * 4)) * this.playbackRate
        engine.playbackTime = Math.max(0, this.startTime + secondsProcessed)
      }
      return callback()
    }

    const ab = new ArrayBuffer(chunk.byteLength)
    const srcFloat32 = new Float32Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 4)
    const dstFloat32 = new Float32Array(ab)
    dstFloat32.set(srcFloat32)

    if (automixActive) {
      engine._mixAutomixIntoCurrent(dstFloat32, this.targetSampleRate, this.channels)
    }

    if (eqActive) {
      try {
        eqProc.processInterleaved(dstFloat32)
      } catch (e) {
        /* ignore single-frame EQ errors */
      }
    }

    if (volActive) {
      for (let i = 0; i < dstFloat32.length; i++) {
        dstFloat32[i] *= vol
      }
    }

    if (engine._outputSink && engine.isPlaying) {
      this.push(Buffer.from(ab))
    }

    this.bytesWritten += chunk.byteLength

    // Legacy path: update playbackTime from decoded bytes (input side).
    // When native bridge is active this is overridden by output-side position.
    if (!engine._bridge) {
      const secondsProcessed =
        (this.bytesWritten / (this.targetSampleRate * this.channels * 4)) * this.playbackRate
      engine.playbackTime = Math.max(0, this.startTime + secondsProcessed)
    }

    callback()
  }
}

class S16lePcmProcessor extends Transform {
  constructor(options) {
    super(options)
    this.engine = options.engine
    this.targetSampleRate = options.targetSampleRate
    this.channels = options.channels
    this.startTime = options.startTime || 0
    this.bytesWritten = 0
    this._carry = null
  }

  _transform(chunk, encoding, callback) {
    if (!this.engine.isPlaying) return callback()

    const input =
      this._carry && this._carry.length
        ? Buffer.concat([this._carry, chunk], this._carry.length + chunk.length)
        : chunk
    const usableBytes = input.length - (input.length % 2)
    this._carry = usableBytes < input.length ? Buffer.from(input.subarray(usableBytes)) : null

    if (usableBytes <= 0) return callback()

    const sampleCount = usableBytes / 2
    const ab = new ArrayBuffer(sampleCount * 4)
    const dstFloat32 = new Float32Array(ab)
    for (let i = 0, o = 0; i < usableBytes; i += 2, o++) {
      const s = input.readInt16LE(i)
      dstFloat32[o] = s < 0 ? s / 32768 : s / 32767
    }

    if (this.engine._eqProcessor) {
      try {
        this.engine._eqProcessor.processInterleaved(dstFloat32)
      } catch {
        /* ignore single-frame EQ errors */
      }
    }

    const vol = this.engine.volume
    for (let i = 0; i < dstFloat32.length; i++) {
      dstFloat32[i] *= vol
    }

    this.push(Buffer.from(ab))
    this.bytesWritten += usableBytes

    if (!this.engine._bridge) {
      const secondsProcessed = this.bytesWritten / (this.targetSampleRate * this.channels * 2)
      this.engine.playbackTime = Math.max(0, this.startTime + secondsProcessed)
    }

    callback()
  }
}

class AutomixSourceBuffer extends Writable {
  constructor({ maxQueuedBytes = 6 * 1024 * 1024 } = {}) {
    super()
    this._chunks = []
    this._queuedBytes = 0
    this._output = null
    this._ended = false
    this._maxQueuedBytes = Math.max(1024 * 1024, Number(maxQueuedBytes) || 6 * 1024 * 1024)
    this._resumeQueuedBytes = Math.max(512 * 1024, Math.floor(this._maxQueuedBytes * 0.55))
    this._pendingCallbacks = []
    this._pumpScheduled = false
  }

  _write(chunk, encoding, callback) {
    let buf = Buffer.from(chunk)
    if (buf.byteLength > 0) {
      this._chunks.push(buf)
      this._queuedBytes += buf.byteLength
    }
    if (this._output) this._schedulePump()
    this._completeOrHold(callback)
  }

  _final(callback) {
    this._ended = true
    if (this._output) this._schedulePump()
    callback()
  }

  _destroy(error, callback) {
    this._chunks = []
    this._queuedBytes = 0
    this._output = null
    this._releaseHeldCallbacks(true)
    callback(error)
  }

  get queuedBytes() {
    return this._queuedBytes
  }

  get ended() {
    return this._ended
  }

  readBytes(byteCount) {
    const wanted = Math.max(0, Number(byteCount) || 0)
    if (wanted <= 0) return Buffer.alloc(0)
    const out = Buffer.alloc(wanted)
    let offset = 0
    while (offset < wanted && this._chunks.length > 0) {
      const chunk = this._chunks[0]
      const take = Math.min(chunk.byteLength, wanted - offset)
      chunk.copy(out, offset, 0, take)
      offset += take
      this._queuedBytes -= take
      if (take >= chunk.byteLength) {
        this._chunks.shift()
      } else {
        this._chunks[0] = chunk.subarray(take)
      }
    }
    this._releaseHeldCallbacks()
    return out
  }

  promoteTo(output) {
    this._output = output || null
    this._schedulePump()
  }

  _completeOrHold(callback) {
    if (this._queuedBytes >= this._maxQueuedBytes) {
      this._pendingCallbacks.push(callback)
      return
    }
    callback()
  }

  _releaseHeldCallbacks(force = false) {
    if (
      this._pendingCallbacks.length === 0 ||
      (!force && this._queuedBytes > this._resumeQueuedBytes)
    ) {
      return
    }
    const callbacks = this._pendingCallbacks.splice(0)
    for (const callback of callbacks) {
      try {
        callback()
      } catch {
        /* ignore */
      }
    }
  }

  _schedulePump() {
    if (this._pumpScheduled || !this._output) return
    this._pumpScheduled = true
    setImmediate(() => this._pumpQueued())
  }

  _pumpQueued() {
    this._pumpScheduled = false
    const output = this._output
    if (!output || output.destroyed || output.writableEnded) {
      this._releaseHeldCallbacks()
      return
    }

    let writes = 0
    while (this._chunks.length > 0 && writes < 16) {
      const chunk = this._chunks.shift()
      this._queuedBytes -= chunk.byteLength
      const canContinue = this._writeToOutput(chunk)
      writes += 1
      if (!canContinue) {
        this._releaseHeldCallbacks()
        output.once('drain', () => this._schedulePump())
        return
      }
    }

    this._releaseHeldCallbacks()

    if (this._chunks.length > 0) {
      this._schedulePump()
      return
    }

    if (this._ended) {
      try {
        output.end()
      } catch {
        /* ignore */
      }
    }
  }

  _writeToOutput(chunk) {
    const output = this._output
    if (!output || output.destroyed || output.writableEnded) return true
    try {
      return output.write(chunk)
    } catch {
      /* ignore */
    }
    return true
  }
}

export class AudioEngine {
  constructor() {
    this._outputSink = null // naudiodon AudioIO OR bridge writable
    this._bridge = null // NativeAudioBridge instance (null = legacy mode)
    this.activeDevice = null
    this.activeDeviceIndex = -1
    this.isPlaying = false
    this.ffmpegProcess = null
    this.playbackTime = 0
    this.volume = 1.0
    this.playbackRate = 1.0
    this.currentFilePath = null
    this.processor = null
    this._pcmInputStream = null
    this.exclusiveMode = false
    this._asioMode = false
    this.eqConfig = null
    /** HiFi path: PCM EQ + preamp (mirrors renderer Web Audio chain). */
    this._eqProcessor = null
    this.bufferProfile = 'balanced'
    /** Track the sample rates and format info for status reporting */
    this._fileSampleRate = 0
    this._outputSampleRate = 0
    this._deviceOutputSampleRate = 0
    this._fileCodec = ''
    this._fileBitsPerSample = 0
    this._fileIsDSD = false
    this._fileDsdRate = 0
    this._onTrackEnded = null
    this._fadeInterval = null
    this._userVolume = 1.0   // 用户设定的目标音量，fade 不覆盖这个值
    this._useNativeBridge = isNativeBridgeAvailable()
    this.vstBridge = new VstBridge()
    /** Gapless playback */
    this._gaplessEnabled = false
    this._nextTrackPb = null     // prebuffer state for next track
    this._activeChannels = 2     // channels used by current bridge stream
    this._onGaplessTrackChanged = null
    this._automixState = null
    this._automixSerial = 0
    this._onAutomixTrackChanged = null
    this._directNativePipe = false
    this._directNativePipeVolume = 1.0
    this._directNativeVolumeRestartTimer = null

    if (this._useNativeBridge) {
      // Avoid Unicode punctuation in Windows consoles (can render as mojibake).
      console.log('[AudioEngine] Native bridge available - HiFi mode enabled')
    } else {
      console.log('[AudioEngine] Native bridge not found - using naudiodon fallback')
    }
  }

  onTrackEnded(fn) {
    this._onTrackEnded = fn
  }

  onGaplessTrackChanged(fn) {
    this._onGaplessTrackChanged = fn
  }

  onAutomixTrackChanged(fn) {
    this._onAutomixTrackChanged = fn
  }

  setGapless(enabled) {
    this._gaplessEnabled = !!enabled
    logLine(`[AudioEngine] Gapless: ${this._gaplessEnabled ? 'enabled' : 'disabled'}`)
    if (this._gaplessEnabled) this._restartDirectNativePipeWithProcessor('gapless-enabled')
  }

  /**
   * Begin pre-decoding the next track into memory so it's ready for a
   * zero-gap transition when the current track ends.
   * Safe to call while playing; cancels any previous prebuffer.
   */
  prebufferNextTrack(filePath) {
    this._cancelPrebuffer()
    if (!filePath || !this._gaplessEnabled || !this._useNativeBridge) return
    const sourcePath = getCueAudioPath(filePath)
    const cueTrack = parseCueVirtualPath(filePath)
    const cueStart = cueTrack?.start || 0
    const cueDuration = cueTrack?.end && cueTrack.end > cueStart ? cueTrack.end - cueStart : null

    const pb = {
      path: filePath,
      sourcePath,
      cueStart,
      chunks: [],
      totalBytes: 0,
      bufferedSeconds: 0,
      done: false,
      cancelled: false,
      info: null,
      targetSampleRate: this._outputSampleRate || 44100,
      channels: this._activeChannels || 2,
      ffmpegCmd: null
    }
    this._nextTrackPb = pb

    const MAX_PREBUFFER_BYTES = 12 * 1024 * 1024 // ~6s of 44.1kHz stereo float32

    this._getFileInfo(sourcePath)
      .then((info) => {
        if (this._nextTrackPb !== pb) return
        pb.info = info
        const fileSampleRate = info.sampleRate || 44100
        const channels = Math.max(1, Math.min(2, info.channels || 2))
        pb.channels = channels
        const bytesPerSec = pb.targetSampleRate * channels * 4

        const filters = []
        if (fileSampleRate !== pb.targetSampleRate) {
          filters.push(`aresample=${pb.targetSampleRate}`)
        }

        const cmd = applyFfmpegInputOptions(ffmpeg(sourcePath))
          .seekInput(cueStart)
          .format('f32le')
          .audioChannels(channels)
          .audioFrequency(pb.targetSampleRate)
        if (Number(cueDuration) > 0) cmd.duration(Number(cueDuration))
        if (info.isDSD) filters.unshift(`volume=${DSD_PCM_GAIN_DB}dB`)
        if (filters.length > 0) cmd.audioFilters(filters)
        cmd.on('error', (e) => {
          const message = String(e?.message || '')
          if (
            pb.cancelled ||
            this._nextTrackPb !== pb ||
            message.includes('SIGKILL') ||
            message.includes('Output stream closed')
          ) {
            return
          }
          console.warn('[AudioEngine] Gapless prebuffer ffmpeg error:', message)
          if (this._nextTrackPb === pb) this._nextTrackPb = null
        })
        pb.ffmpegCmd = cmd

        const stream = cmd.pipe()
        stream.on('data', (chunk) => {
          if (this._nextTrackPb !== pb) {
            pb.cancelled = true
            stream.destroy()
            return
          }
          pb.chunks.push(Buffer.from(chunk))
          pb.totalBytes += chunk.byteLength
          pb.bufferedSeconds = pb.totalBytes / bytesPerSec
          if (pb.totalBytes >= MAX_PREBUFFER_BYTES) {
            pb.cancelled = true
            stream.destroy()
          }
        })
        stream.on('end', () => {
          if (this._nextTrackPb === pb) {
            pb.done = true
            logLine(`[AudioEngine] Gapless prebuffer done (full): ${filePath}`)
          }
        })
        stream.on('close', () => {
          if (this._nextTrackPb === pb && !pb.done) {
            logLine(`[AudioEngine] Gapless prebuffer ready (${pb.bufferedSeconds.toFixed(1)}s): ${filePath}`)
          }
        })
        stream.on('error', (e) => {
          if (
            pb.cancelled ||
            e.message?.includes('SIGKILL') ||
            e.message?.includes('Output stream closed')
          ) {
            return
          }
          if (!e.message?.includes('SIGKILL')) {
            console.warn('[AudioEngine] Gapless prebuffer error:', e.message)
          }
          if (this._nextTrackPb === pb) this._nextTrackPb = null
        })
      })
      .catch((e) => {
        console.warn('[AudioEngine] Gapless prebuffer getFileInfo failed:', e.message)
        if (this._nextTrackPb === pb) this._nextTrackPb = null
      })
  }

  _cancelPrebuffer() {
    const pb = this._nextTrackPb
    this._nextTrackPb = null
    if (pb?.ffmpegCmd) {
      pb.cancelled = true
      try { pb.ffmpegCmd.kill('SIGKILL') } catch { /* ignore */ }
    }
  }

  cancelAutomix() {
    const state = this._automixState
    this._automixState = null
    if (!state) return
    state.cancelled = true
    try {
      state.stream?.destroy()
    } catch {
      /* ignore */
    }
    try {
      state.sourceBuffer?.destroy()
    } catch {
      /* ignore */
    }
    try {
      state.ffmpegCmd?.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    if (!state.switchNotified && this.processor && this._outputSink && this.isPlaying) {
      try {
        this.processor.unpipe(this._outputSink)
        this.processor.pipe(this._outputSink)
      } catch {
        /* ignore */
      }
    }
  }

  async startAutomixNextTrack(filePath, options = {}) {
    const nextPath = normalizeStreamUri(filePath)
    const nextSourcePath = getCueAudioPath(nextPath)
    const nextCue = parseCueVirtualPath(nextPath)
    const nextCueStart = nextCue?.start || 0
    const nextCueDuration = nextCue?.end && nextCue.end > nextCueStart ? nextCue.end - nextCueStart : null
    if (
      this._directNativePipe &&
      nextPath &&
      this.isPlaying &&
      this._bridge &&
      this._outputSink &&
      this.currentFilePath
    ) {
      const currentPath = this.currentFilePath
      const resumeAt = this._bridge.isReady
        ? Math.max(0, Number(this._bridge.getPosition()) || 0)
        : Math.max(0, Number(this.playbackTime) || 0)
      logLine('[AudioEngine] Switching direct native pipe to DSP path for Automix')
      await this.play(currentPath, resumeAt, this.playbackRate, { forceProcessor: true })
    }
    if (!nextPath || !this.isPlaying || !this._bridge || !this._outputSink || !this.processor) {
      return { ok: false, skipped: 'inactive' }
    }
    if (this.playbackRate !== 1.0) {
      return { ok: false, skipped: 'playback_rate' }
    }
    if (this.vstBridge?.enabled) {
      return { ok: false, skipped: 'vst_active' }
    }

    const existing = this._automixState
    if (existing?.nextPath === nextPath && !existing.cancelled) {
      return { ok: true, alreadyActive: true }
    }

    this.cancelAutomix()

    const currentPathAtStart = this.currentFilePath
    const targetSampleRate = this._outputSampleRate || this._deviceOutputSampleRate || 44100
    const channels = this._activeChannels || 2
    const durationSec = Math.max(
      AUTOMIX_MIN_DURATION_SEC,
      Math.min(AUTOMIX_MAX_DURATION_SEC, Number(options.durationSec) || 6)
    )
    const leadSec = Math.max(0, Math.min(1.5, Number(options.leadSec) || 0))
    const nextInfo = await this._getFileInfo(nextSourcePath)
    if (!this.isPlaying || this.currentFilePath !== currentPathAtStart || !this._bridge) {
      return { ok: false, skipped: 'track_changed' }
    }

    if (
      (this.exclusiveMode || this._asioMode) &&
      nextInfo.sampleRate > 0 &&
      targetSampleRate > 0 &&
      nextInfo.sampleRate !== targetSampleRate
    ) {
      logLine(
        `[AudioEngine] Automix skipped: exclusive/asio sample-rate switch required (${targetSampleRate}Hz -> ${nextInfo.sampleRate}Hz)`
      )
      return { ok: false, skipped: 'exclusive_sample_rate_switch' }
    }

    const ffmpegCmd = this._createFfmpegCommand(
      nextSourcePath,
      nextCueStart,
      1.0,
      channels,
      nextInfo.sampleRate || targetSampleRate,
      targetSampleRate,
      nextCueDuration,
      !!nextInfo.isDSD
    )
    const sourceBuffer = new AutomixSourceBuffer()
    const stream = ffmpegCmd.pipe()
    const serial = ++this._automixSerial
    const state = {
      serial,
      currentPath: currentPathAtStart,
      nextPath,
      nextInfo,
      ffmpegCmd,
      stream,
      sourceBuffer,
      sampleRate: targetSampleRate,
      channels,
      totalFrames: Math.max(1, Math.round(durationSec * targetSampleRate)),
      waitFrames: Math.max(0, Math.round(leadSec * targetSampleRate)),
      mixedFrames: 0,
      nextFramesUsed: 0,
      mixStarted: false,
      switchNotified: false,
      promoteScheduled: false,
      cancelled: false
    }

    this._automixState = state

    try {
      this.processor.unpipe(this._outputSink)
      this.processor.pipe(this._outputSink, { end: false })
      this.processor.once('finish', () => {
        if (this._automixState !== state || state.promoteScheduled || state.cancelled) return
        if (state.mixStarted) {
          this._scheduleAutomixPromotion(state)
        } else {
          this.cancelAutomix()
          this.isPlaying = false
          if (this._onTrackEnded) this._onTrackEnded()
        }
      })
    } catch {
      /* keep the existing pipe when it cannot be rewired */
    }

    stream.on('error', (e) => {
      if (state.cancelled || String(e?.message || '').includes('SIGKILL')) return
      console.warn('[AudioEngine] Automix input stream error:', e?.message || e)
      if (this._automixState === state) this.cancelAutomix()
    })
    stream.pipe(sourceBuffer)

    logLine(
      `[AudioEngine] Automix armed: ${formatPathForLog(nextPath)} | duration=${durationSec.toFixed(2)}s | lead=${leadSec.toFixed(2)}s | out=${targetSampleRate}Hz ch=${channels}`
    )
    return { ok: true, durationSec, leadSec }
  }

  _mixAutomixIntoCurrent(samples, sampleRate, channels) {
    const state = this._automixState
    if (!state || state.cancelled || !samples?.length) return
    if (sampleRate !== state.sampleRate || channels !== state.channels) {
      this.cancelAutomix()
      return
    }

    const frameCount = Math.floor(samples.length / channels)
    if (frameCount <= 0) return

    if (state.waitFrames > 0) {
      state.waitFrames = Math.max(0, state.waitFrames - frameCount)
      return
    }

    const bytesNeeded = frameCount * channels * 4
    if (!state.mixStarted) {
      const minStartBytes = Math.max(bytesNeeded, Math.round(sampleRate * channels * 4 * 0.35))
      if (!state.sourceBuffer.ended && state.sourceBuffer.queuedBytes < minStartBytes) {
        return
      }
      state.mixStarted = true
    }

    const nextChunk = state.sourceBuffer.readBytes(bytesNeeded)
    const nextSamples = new Float32Array(
      nextChunk.buffer,
      nextChunk.byteOffset,
      nextChunk.byteLength / 4
    )

    const totalFrames = Math.max(1, state.totalFrames)
    const halfPi = Math.PI / 2
    for (let frame = 0; frame < frameCount; frame++) {
      const absoluteFrame = state.mixedFrames + frame
      const t = Math.max(0, Math.min(1, absoluteFrame / totalFrames))
      const currentGain = Math.cos(t * halfPi)
      const nextGain = Math.sin(t * halfPi)
      const base = frame * channels
      for (let ch = 0; ch < channels; ch++) {
        const idx = base + ch
        samples[idx] = samples[idx] * currentGain + (nextSamples[idx] || 0) * nextGain
      }
    }

    state.mixedFrames += frameCount
    state.nextFramesUsed += frameCount

    if (state.mixedFrames >= state.totalFrames) {
      this._scheduleAutomixPromotion(state)
    }
  }

  _switchAutomixIdentity(state) {
    if (!state || state.switchNotified || this._automixState !== state) return
    state.switchNotified = true
    this.currentFilePath = state.nextPath
    this.playbackTime = 0
    this._fileSampleRate = state.nextInfo.sampleRate || state.sampleRate
    this._fileBitsPerSample = state.nextInfo.bitsPerSample || 16
    this._fileCodec = state.nextInfo.codec || 'unknown'
    this._fileIsDSD = !!state.nextInfo.isDSD
    this._fileDsdRate = state.nextInfo.isDSD ? state.nextInfo.sampleRate : 0
    this._bridge?.resetForGapless?.(0, this.playbackRate)
    if (this._onAutomixTrackChanged) this._onAutomixTrackChanged(state.nextPath)
  }

  _scheduleAutomixPromotion(state) {
    if (!state || state.promoteScheduled || this._automixState !== state) return
    state.promoteScheduled = true
    setImmediate(() => this._promoteAutomixNext(state))
  }

  _promoteAutomixNext(state) {
    if (!state || this._automixState !== state || state.cancelled) return
    const sink = this._outputSink
    if (!sink || !this.isPlaying) {
      this.cancelAutomix()
      return
    }

    const oldProcessor = this.processor
    const oldFfmpeg = this.ffmpegProcess
    this.processor = null
    this.ffmpegProcess = null

    try {
      if (oldProcessor && oldProcessor !== state.sourceBuffer) {
        oldProcessor.unpipe(sink)
        oldProcessor.destroy()
      }
    } catch {
      /* ignore */
    }
    try {
      if (oldFfmpeg && oldFfmpeg !== state.ffmpegCmd) oldFfmpeg.kill('SIGKILL')
    } catch {
      /* ignore */
    }

    const nextProcessor = new AudioProcessor({
      engine: this,
      targetSampleRate: state.sampleRate,
      channels: state.channels,
      playbackRate: this.playbackRate,
      startTime: 0
    })
    this.processor = nextProcessor
    this.ffmpegProcess = state.ffmpegCmd

    this._switchAutomixIdentity(state)

    nextProcessor.pipe(sink)
    nextProcessor.once('finish', () => {
      if (this.currentFilePath === state.nextPath && this.isPlaying) {
        this.isPlaying = false
        if (this._onTrackEnded) this._onTrackEnded()
      }
    })

    state.sourceBuffer.promoteTo(nextProcessor)
    this._automixState = null
    logLine(`[AudioEngine] Automix promoted: ${formatPathForLog(state.nextPath)}`)
  }

  /**
   * Called when current track's processor finishes in gapless mode.
   * If prebuffer is ready and format matches, transitions without stopping bridge.
   */
  _handleGaplessTransition(endedFilePath) {
    if (this.currentFilePath !== endedFilePath || !this.isPlaying) return

    const pb = this._nextTrackPb
    const sink = this._outputSink
    const bridge = this._bridge

    // Fallback to normal end if conditions aren't met
    if (
      !pb ||
      !pb.info ||
      pb.chunks.length === 0 ||
      !sink ||
      !bridge ||
      pb.targetSampleRate !== this._outputSampleRate ||
      pb.channels !== this._activeChannels
    ) {
      this.isPlaying = false
      if (this._onTrackEnded) this._onTrackEnded()
      return
    }

    this._nextTrackPb = null

    // Kill old processor + ffmpeg (they're done, but clean up refs)
    if (this.processor) {
      try { this.processor.destroy() } catch { /* ignore */ }
      this.processor = null
    }
    if (this.ffmpegProcess) {
      try { this.ffmpegProcess.kill('SIGKILL') } catch { /* ignore */ }
      this.ffmpegProcess = null
    }

    // Update track metadata
    const nextPath = pb.path
    this.currentFilePath = nextPath
    this.playbackTime = 0
    this._fileSampleRate = pb.info.sampleRate || 44100
    this._fileBitsPerSample = pb.info.bitsPerSample || 16
    this._fileCodec = pb.info.codec || 'unknown'
    this._fileIsDSD = !!pb.info.isDSD
    this._fileDsdRate = pb.info.isDSD ? pb.info.sampleRate : 0

    // Reset bridge position counter for correct time display
    bridge.resetForGapless(0, this.playbackRate)

    // Create fresh processor for next track
    const newProcessor = new AudioProcessor({
      engine: this,
      targetSampleRate: pb.targetSampleRate,
      channels: pb.channels,
      playbackRate: this.playbackRate,
      startTime: 0
    })
    this.processor = newProcessor

    // Keep bridge open: pipe with { end: false } and hook next transition
    newProcessor.pipe(sink, { end: false })
    newProcessor.once('finish', () => this._handleGaplessTransition(nextPath))

    this._pumpGaplessPrebuffer(pb, newProcessor, nextPath)

    // Notify renderer to advance track display without restarting audio
    if (this._onGaplessTrackChanged) this._onGaplessTrackChanged(nextPath)
  }

  _pumpGaplessPrebuffer(pb, processor, nextPath) {
    const chunks = Array.isArray(pb?.chunks) ? pb.chunks : []
    pb.chunks = []
    let index = 0
    let remainderStarted = false

    const isStillCurrent = () =>
      this.isPlaying &&
      this.currentFilePath === nextPath &&
      this.processor === processor &&
      !processor.destroyed

    const startRemainder = () => {
      if (remainderStarted || !isStillCurrent()) return
      remainderStarted = true

      if (!pb.done) {
        const seekTo = Math.max(0, pb.bufferedSeconds - 0.1)
        this._setupFFmpeg(
          nextPath,
          seekTo,
          this.playbackRate,
          pb.channels,
          pb.info.sampleRate || 44100,
          pb.targetSampleRate,
          null,
          !!pb.info.isDSD
        )
        this.ffmpegProcess.pipe(processor)
        logLine(
          `[AudioEngine] Gapless transition OK: streaming ${nextPath} from ${seekTo.toFixed(2)}s`
        )
        return
      }

      processor.end()
      logLine(`[AudioEngine] Gapless transition OK: fully buffered ${nextPath}`)
    }

    const pump = () => {
      if (!isStillCurrent()) return
      let batchCount = 0

      while (index < chunks.length && batchCount < 8) {
        const canContinue = processor.write(chunks[index])
        index += 1
        batchCount += 1
        if (!canContinue) {
          processor.once('drain', () => setImmediate(pump))
          return
        }
      }

      if (index < chunks.length) {
        setImmediate(pump)
        return
      }

      startRemainder()
    }

    setImmediate(pump)
  }

  getMediaInfo(uri) {
    return this._getFileInfo(uri)
  }

  getDevices() {
    if (this._useNativeBridge) {
      try {
        const nativeDevices = listNativeDevices()
        if (nativeDevices.length > 0) {
          return nativeDevices.map((d) => ({
            id: d.index,
            name: d.name,
            hostApi: 'WASAPI',
            sampleRate: d.sampleRate || 0,
            sharedSampleRate: d.sharedSampleRate || 0,
            maxChannels: 0,
            isDefault: !!d.isDefault
          }))
        }
      } catch (e) {
        console.warn('[AudioEngine] native device list failed, fallback:', e?.message)
      }
      return []
    }
    try {
      const naudiodon = loadNaudiodon()
      if (!naudiodon) return []
      const devices = naudiodon.getDevices()
      return devices
        .filter((d) => d.maxOutputChannels > 0)
        .map((d) => ({
          id: d.id,
          name: d.name,
          hostApi: d.hostApi,
          sampleRate: d.defaultSampleRate || 44100,
          maxChannels: d.maxOutputChannels
        }))
    } catch {
      return []
    }
  }

  _getNativeExclusiveSampleRate() {
    const activeRate = Number(this.activeDevice?.sampleRate) || 0
    if (activeRate > 0) return activeRate

    try {
      const devices = listNativeDevices()
      const target = devices.find((d) => d.isDefault) || devices[0]
      const defaultRate = Number(target?.sampleRate) || 0
      return defaultRate > 0 ? defaultRate : 0
    } catch {
      return 0
    }
  }

  _getNativeSharedSampleRate() {
    const activeRate = Number(this.activeDevice?.sharedSampleRate) || 0
    if (activeRate > 0) return activeRate

    try {
      const devices = listNativeDevices()
      const target = devices.find((d) => d.isDefault) || devices[0]
      const sharedRate = Number(target?.sharedSampleRate) || 0
      return sharedRate > 0 ? sharedRate : 0
    } catch {
      return 0
    }
  }

  async setDevice(deviceId) {
    if (deviceId == null || deviceId === '') {
      const wasPlaying = this.isPlaying
      const pos = this.playbackTime
      const file = this.currentFilePath
      const rate = this.playbackRate

      this.activeDevice = null
      this.activeDeviceIndex = -1
      console.log('[AudioEngine] Active device reset to system default')

      if (this._useNativeBridge && wasPlaying && file) {
        await this._releaseResources()
        this.play(file, pos, rate)
      }

      return { success: true, device: null }
    }

    if (this._useNativeBridge) {
      const idx = typeof deviceId === 'number' ? deviceId : parseInt(deviceId, 10)
      if (isNaN(idx) || idx < 0) return { success: false, error: 'Invalid device index' }
      const wasPlaying = this.isPlaying
      const pos = this.playbackTime
      const file = this.currentFilePath
      const rate = this.playbackRate
      const selectedDevice = listNativeDevices().find((d) => d.index === idx)

      this.activeDeviceIndex = idx
      this.activeDevice = {
        id: idx,
        name: selectedDevice?.name || `Device #${idx}`,
        sampleRate: selectedDevice?.sampleRate || 0,
        sharedSampleRate: selectedDevice?.sharedSampleRate || 0,
        isDefault: !!selectedDevice?.isDefault
      }
      const srText = this.activeDevice.sampleRate > 0 ? `, max ${this.activeDevice.sampleRate}Hz` : ''
      console.log(`[AudioEngine] Native device set: index ${idx}${srText}`)

      if (wasPlaying && file) {
        await this._releaseResources()
        this.play(file, pos, rate)
      }
      return { success: true, device: this.activeDevice }
    }

    const naudiodon = loadNaudiodon()
    if (!naudiodon) return { success: false, error: 'PortAudio fallback unavailable' }
    const devices = naudiodon.getDevices()
    const device = devices.find((d) => d.id === deviceId)
    if (device) {
      this.activeDevice = device
      this.activeDeviceIndex = -1
      console.log(`[AudioEngine] Active device set: ${device.name}`)
      return { success: true, device: this.activeDevice }
    }
    return { success: false, error: 'Device not found' }
  }

  setExclusive(exclusive) {
    this.exclusiveMode = !!exclusive
    console.log(`[AudioEngine] Exclusive mode: ${this.exclusiveMode}`)
  }

  setAsio(enabled) {
    this._asioMode = !!enabled
    console.log(`[AudioEngine] ASIO mode: ${this._asioMode}`)
  }

  getAsioMode() {
    return this._asioMode
  }

  setOutputBufferProfile(profile) {
    this.bufferProfile = profile || 'balanced'
  }

  setEqConfig(eqConfig) {
    this.eqConfig = eqConfig
    if (this._eqProcessor) {
      try {
        this._eqProcessor.update(eqConfig)
      } catch (e) {
        console.warn('[AudioEngine] EQ update failed:', e?.message)
      }
    }
    if (this._directNativePipe && this._eqProcessor && !this._eqProcessor.bypass) {
      this._restartDirectNativePipeWithProcessor('eq-enabled')
    }
  }

  _shouldUseDirectNativePipe({ forceProcessor = false } = {}) {
    if (forceProcessor) return false
    if (!this._bridge || !this._outputSink) return false
    if (this._gaplessEnabled) return false
    if (this.vstBridge?.enabled) return false
    if (this._automixState && !this._automixState.cancelled) return false
    if (this._eqProcessor && !this._eqProcessor.bypass) return false
    return true
  }

  _clearDirectNativeVolumeRestartTimer() {
    if (!this._directNativeVolumeRestartTimer) return
    clearTimeout(this._directNativeVolumeRestartTimer)
    this._directNativeVolumeRestartTimer = null
  }

  _restartDirectNativePipe(reason = 'native-pipe-refresh') {
    if (!this._directNativePipe || !this.currentFilePath || !this.isPlaying) return
    this._clearDirectNativeVolumeRestartTimer()
    const resumeAt =
      this._bridge && this._bridge.isReady
        ? Math.max(0, Number(this._bridge.getPosition()) || 0)
        : Math.max(0, Number(this.playbackTime) || 0)
    const filePath = this.currentFilePath
    const rate = this.playbackRate
    this._directNativePipe = false
    logLine(`[AudioEngine] Direct native PCM pipe restarting: ${reason}`)
    this.play(filePath, resumeAt, rate).catch((e) => {
      console.warn('[AudioEngine] Failed to restart direct pipe:', e?.message || e)
    })
  }

  _scheduleDirectNativePipeRestart(reason = 'native-pipe-refresh') {
    if (!this._directNativePipe || !this.currentFilePath || !this.isPlaying) return
    this._clearDirectNativeVolumeRestartTimer()
    this._directNativeVolumeRestartTimer = setTimeout(() => {
      this._directNativeVolumeRestartTimer = null
      this._restartDirectNativePipe(reason)
    }, 180)
  }

  _restartDirectNativePipeWithProcessor(reason = 'dsp-enabled') {
    if (!this._directNativePipe || !this.currentFilePath || !this.isPlaying) return
    this._clearDirectNativeVolumeRestartTimer()
    const resumeAt =
      this._bridge && this._bridge.isReady
        ? Math.max(0, Number(this._bridge.getPosition()) || 0)
        : Math.max(0, Number(this.playbackTime) || 0)
    const filePath = this.currentFilePath
    const rate = this.playbackRate
    this._directNativePipe = false
    logLine(`[AudioEngine] Direct native PCM pipe disabled: ${reason}`)
    this.play(filePath, resumeAt, rate, { forceProcessor: true }).catch((e) => {
      console.warn('[AudioEngine] Failed to switch direct pipe to DSP path:', e?.message || e)
    })
  }

  loadVstPlugin(pluginPath) {
    if (this.vstBridge) {
      this.vstBridge.loadPlugin(pluginPath)
      // Restart playback if currently playing
      if (this.isPlaying && this.currentFilePath) {
        this.play(this.currentFilePath, this.playbackTime, this.playbackRate)
      }
    }
  }

  disableVstPlugin() {
    if (this.vstBridge) {
      this.vstBridge.disable()
      if (this.isPlaying && this.currentFilePath) {
        this.play(this.currentFilePath, this.playbackTime, this.playbackRate)
      }
    }
  }

  showVstPluginUI() {
    if (this.vstBridge) {
      this.vstBridge.showPluginUI()
    }
  }

  async play(filePath, startTime = 0, playbackRate = 1.0, options = {}) {
    const forceProcessor = !!(options && typeof options === 'object' && options.forceProcessor)
    while (this._playLocked) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    this._playLocked = true

    try {
      this._cancelPrebuffer()
      this.cancelAutomix()
      await this._releaseResources()

      if (/^https?:\/\//i.test(filePath)) filePath = normalizeStreamUri(filePath)
      const requestedFilePath = filePath
      const cueTrack = parseCueVirtualPath(requestedFilePath)
      const playbackFilePath = getCueAudioPath(requestedFilePath)
      const decodeStartTime = cueTrack ? toCueAbsoluteTime(requestedFilePath, startTime) : startTime
      const decodeDuration =
        cueTrack?.end && cueTrack.end > decodeStartTime ? cueTrack.end - decodeStartTime : null

      this.currentFilePath = requestedFilePath
      this.playbackRate = playbackRate
      this.playbackTime = startTime

      const info = await this._getFileInfo(playbackFilePath)
      const fileSampleRate = info.sampleRate || 44100
      const channels = Math.max(1, Math.min(2, info.channels || 2))

      this._fileCodec = info.codec || 'unknown'
      this._fileBitsPerSample = info.bitsPerSample || 16
      this._fileIsDSD = !!info.isDSD
      this._fileDsdRate = info.isDSD ? fileSampleRate : 0

      let targetSampleRate
      let deviceOutputSampleRate = 0
      if (info.isDSD) {
        // DSD -> PCM: convert at a high-res rate preserving maximum fidelity
        // DSD64 (2.8 MHz) -> 176.4 kHz, DSD128 (5.6 MHz) -> 352.8 kHz
        const dsdPcmRate = Math.min(352800, Math.max(176400, Math.round(fileSampleRate / 16)))
        targetSampleRate =
          (this.exclusiveMode || this._asioMode) && this._useNativeBridge ? dsdPcmRate : 44100
        deviceOutputSampleRate = targetSampleRate
        logLine(`[AudioEngine] DSD detected: native=${fileSampleRate}Hz -> PCM ${dsdPcmRate}Hz`)
      } else if (this.exclusiveMode && !this._asioMode && this._useNativeBridge) {
        const nativeDeviceSampleRate = this._getNativeExclusiveSampleRate()
        const exclusiveRateLimit =
          nativeDeviceSampleRate > 0
            ? Math.min(nativeDeviceSampleRate, MAX_WASAPI_EXCLUSIVE_PCM_SAMPLE_RATE)
            : MAX_WASAPI_EXCLUSIVE_PCM_SAMPLE_RATE
        if (fileSampleRate > exclusiveRateLimit) {
          targetSampleRate = exclusiveRateLimit
          logLine(
            `[AudioEngine] WASAPI exclusive source rate ${fileSampleRate}Hz exceeds device exact capability ${exclusiveRateLimit}Hz; decoder resampling to device rate`
          )
        } else {
          targetSampleRate = fileSampleRate
        }
        deviceOutputSampleRate = targetSampleRate
      } else if ((this.exclusiveMode || this._asioMode) && this._useNativeBridge) {
        targetSampleRate = fileSampleRate
        deviceOutputSampleRate = targetSampleRate
      } else if (this._useNativeBridge) {
        const nativeSharedSampleRate = this._getNativeSharedSampleRate()
        targetSampleRate = fileSampleRate
        deviceOutputSampleRate = nativeSharedSampleRate > 0 ? nativeSharedSampleRate : targetSampleRate
        if (deviceOutputSampleRate > 0 && fileSampleRate !== deviceOutputSampleRate) {
          logLine(
            `[AudioEngine] WASAPI shared mixer will resample: bridge=${targetSampleRate}Hz -> mixer=${deviceOutputSampleRate}Hz`
          )
        }
      } else if (this.activeDevice && this.activeDevice.sampleRate > 0) {
        targetSampleRate = this.activeDevice.sampleRate
        deviceOutputSampleRate = targetSampleRate
      } else {
        targetSampleRate = 44100
        deviceOutputSampleRate = targetSampleRate
      }

      this._fileSampleRate = fileSampleRate
      this._outputSampleRate = targetSampleRate
      this._deviceOutputSampleRate = deviceOutputSampleRate || targetSampleRate
      const playLogText =
        `[AudioEngine] Play: ${formatPathForLog(playbackFilePath)} | ${info.codec} ${info.bitsPerSample}bit | ` +
        `src=${fileSampleRate}Hz -> out=${targetSampleRate}Hz | rate=${playbackRate} | ` +
        `bridge=${this._useNativeBridge} | exclusive=${this.exclusiveMode} | asio=${this._asioMode}${info.isDSD ? ' | DSD' : ''}${cueTrack ? ` | cueStart=${cueTrack.start}s` : ''}`
      logLine(playLogText)

      /* ── output backend ── */
      if (this._useNativeBridge) {
        const bridge = new NativeAudioBridge()
        try {
          const bridgeStart = await bridge.start({
            sampleRate: targetSampleRate,
            channels,
            deviceIndex: this.activeDeviceIndex,
            asio: this._asioMode,
            exclusive: this._asioMode ? false : this.exclusiveMode,
            volume: this.volume,
            startTime,
            playbackRate
          })
          const actualSampleRate = bridgeStart?.device?.sampleRate
          if (
            typeof actualSampleRate === 'number' &&
            actualSampleRate > 0 &&
            actualSampleRate !== targetSampleRate
          ) {
            logLine(
              `[AudioEngine] Native output sample-rate adjusted: requested=${targetSampleRate}Hz -> actual=${actualSampleRate}Hz; decoder resampling to actual output rate`
            )
            targetSampleRate = actualSampleRate
            this._outputSampleRate = actualSampleRate
            if (this.exclusiveMode || this._asioMode) {
              this._deviceOutputSampleRate = actualSampleRate
            }
          }
        } catch (e) {
          console.warn('[AudioEngine] Native bridge start failed:', e?.message)
          bridge.stop()
          if (this._asioMode) {
            return { success: false, error: e?.message || 'asio_start_failed' }
          }
          return this._playLegacy(
            playbackFilePath,
            decodeStartTime,
            playbackRate,
            channels,
            fileSampleRate,
            targetSampleRate,
            null,
            startTime
          )
        }

        bridge.onEnded(() => {
          if (this._bridge === bridge && this.isPlaying && this.currentFilePath === requestedFilePath) {
            this.isPlaying = false
            if (this._onTrackEnded) this._onTrackEnded()
          }
        })

        bridge.onError((err) => {
          console.error('[AudioEngine] Bridge error:', err?.message)
          if (err?.message === 'exclusive_denied') {
            console.warn('[AudioEngine] Exclusive denied, retrying shared mode...')
            this.exclusiveMode = false
            this.play(requestedFilePath, this.playbackTime, playbackRate)
          }
        })

        this._bridge = bridge
        this._outputSink = bridge.writable
        this._eqProcessor = createEqFloatProcessor(this.eqConfig, targetSampleRate, channels)
        this._activeChannels = channels
      } else {
        return this._playLegacy(
          playbackFilePath,
          decodeStartTime,
          playbackRate,
          channels,
          fileSampleRate,
          targetSampleRate,
          null,
          startTime
        )
      }

      /* ── FFmpeg decode ── */
      this._setupFFmpeg(
        playbackFilePath,
        decodeStartTime,
        playbackRate,
        channels,
        fileSampleRate,
        targetSampleRate,
        decodeDuration,
        !!info.isDSD
      )

      this.processor = new AudioProcessor({
        engine: this,
        targetSampleRate,
        channels,
        playbackRate,
        startTime
      })

      if (this._shouldUseDirectNativePipe({ forceProcessor })) {
        this._directNativePipe = true
        this._directNativePipeVolume = this.volume
        this.processor = null
        this.ffmpegProcess.pipe(this._outputSink)
        logLine('[AudioEngine] Direct native PCM pipe active (no JS DSP)')
      } else {
        this._directNativePipe = false
        this._directNativePipeVolume = 1.0
        this.ffmpegProcess.pipe(this.processor)
      }

      // 【绝对安全隔离】：Native 核心管道同样加锁，仅开启时使用 vstBridge
      if (this._directNativePipe) {
        // The no-DSP path can stream directly from FFmpeg to the native host.
      } else if (this.vstBridge && this.vstBridge.enabled) {
        this.vstBridge.pipe(this.processor, this._outputSink, targetSampleRate, channels)
      } else if (this._gaplessEnabled) {
        // Gapless: keep bridge writable open when processor ends
        this.processor.pipe(this._outputSink, { end: false })
        this.processor.once('finish', () => this._handleGaplessTransition(requestedFilePath))
      } else {
        this.processor.pipe(this._outputSink)
      }

      this.isPlaying = true
      return { success: true }
    } finally {
      this._playLocked = false
    }
  }

  async playPcmStream({
    stream,
    sampleRate = 44100,
    channels = 2,
    sampleFormat = 's16le',
    label = 'PCM Stream',
    metadata = {}
  } = {}) {
    if (!stream || typeof stream.pipe !== 'function') {
      return { success: false, error: 'invalid_pcm_stream' }
    }
    if (sampleFormat !== 's16le') {
      return { success: false, error: `unsupported_pcm_format_${sampleFormat}` }
    }

    while (this._playLocked) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    this._playLocked = true

    try {
      this._cancelPrebuffer()
      this.cancelAutomix()
      await this._releaseResources()

      const targetSampleRate = Number(sampleRate) > 0 ? Number(sampleRate) : 44100
      const targetChannels = Math.max(1, Math.min(2, Number(channels) || 2))

      this._pcmInputStream = stream
      this.currentFilePath = `airplay://${encodeURIComponent(label || 'stream')}`
      this.playbackRate = 1.0
      this.playbackTime = 0
      this._fileSampleRate = targetSampleRate
      this._outputSampleRate = targetSampleRate
      this._deviceOutputSampleRate = targetSampleRate
      this._fileCodec = label || 'PCM Stream'
      this._fileBitsPerSample = 16
      this._fileIsDSD = false
      this._fileDsdRate = 0

      logLine(
        `[AudioEngine] PCM stream: ${label || 'stream'} | src=${targetSampleRate}Hz -> out=${targetSampleRate}Hz | ch=${targetChannels} | bridge=${this._useNativeBridge} | exclusive=${this.exclusiveMode} | asio=${this._asioMode}`
      )

      if (this._useNativeBridge) {
        const bridge = new NativeAudioBridge()
        try {
          const bridgeStart = await bridge.start({
            sampleRate: targetSampleRate,
            channels: targetChannels,
            deviceIndex: this.activeDeviceIndex,
            asio: this._asioMode,
            exclusive: this._asioMode ? false : this.exclusiveMode,
            volume: this.volume,
            startTime: 0,
            playbackRate: 1.0
          })
          const actualSampleRate = bridgeStart?.device?.sampleRate
          if (
            typeof actualSampleRate === 'number' &&
            actualSampleRate > 0 &&
            actualSampleRate !== targetSampleRate
          ) {
            logLine(
              `[AudioEngine] PCM stream output adjusted: requested=${targetSampleRate}Hz -> actual=${actualSampleRate}Hz`
            )
            this._outputSampleRate = actualSampleRate
            if (this.exclusiveMode || this._asioMode) this._deviceOutputSampleRate = actualSampleRate
          }
        } catch (e) {
          bridge.stop()
          return { success: false, error: e?.message || 'pcm_bridge_start_failed' }
        }

        bridge.onEnded(() => {
          if (this._bridge === bridge && this.isPlaying) this.isPlaying = false
        })

        bridge.onError((err) => {
          console.error('[AudioEngine] PCM bridge error:', err?.message)
          if (err?.message === 'exclusive_denied') this.exclusiveMode = false
        })

        this._bridge = bridge
        this._outputSink = bridge.writable
      } else {
        const naudiodon = loadNaudiodon()
        if (!naudiodon) return { success: false, error: 'PortAudio fallback unavailable' }
        this._outputSink = new naudiodon.AudioIO({
          outOptions: {
            channelCount: targetChannels,
            sampleFormat: naudiodon.SampleFormatFloat32,
            sampleRate: targetSampleRate,
            deviceId: this.activeDevice ? this.activeDevice.id : -1,
            closeOnError: false
          }
        })
        this._bridge = null
      }

      this._eqProcessor = createEqFloatProcessor(this.eqConfig, targetSampleRate, targetChannels)
      this._activeChannels = targetChannels
      this.processor = new S16lePcmProcessor({
        engine: this,
        targetSampleRate,
        channels: targetChannels,
        startTime: 0
      })

      stream.on('error', (e) => {
        console.warn('[AudioEngine] PCM input stream error:', e?.message || e)
      })
      stream.once('end', () => {
        if (this._pcmInputStream === stream) this.isPlaying = false
      })
      stream.once('close', () => {
        if (this._pcmInputStream === stream) this._pcmInputStream = null
      })

      stream.pipe(this.processor)
      if (this.vstBridge && this.vstBridge.enabled) {
        this.vstBridge.pipe(this.processor, this._outputSink, targetSampleRate, targetChannels)
      } else {
        this.processor.pipe(this._outputSink)
      }
      if (!this._bridge && this._outputSink?.start) this._outputSink.start()

      this.isPlaying = true
      return { success: true, metadata }
    } finally {
      this._playLocked = false
    }
  }

  /**
   * Legacy playback path using naudiodon (PortAudio).
   */
  _playLegacy(
    filePath,
    startTime,
    playbackRate,
    channels,
    fileSampleRate,
    targetSampleRate,
    decodeDuration = null,
    displayStartTime = startTime
  ) {
    try {
      const naudiodon = loadNaudiodon()
      if (!naudiodon) return { success: false, error: 'PortAudio fallback unavailable' }
      const ao = new naudiodon.AudioIO({
        outOptions: {
          channelCount: channels,
          sampleFormat: naudiodon.SampleFormatFloat32,
          sampleRate: targetSampleRate,
          deviceId: this.activeDevice ? this.activeDevice.id : -1,
          closeOnError: false
        }
      })
      this._outputSink = ao
      this._bridge = null
    } catch (e) {
      console.error('[AudioEngine] PortAudio Error:', e.message)
      return { success: false, error: e.message }
    }

    this._eqProcessor = null

    this._setupFFmpeg(
      filePath,
      startTime,
      playbackRate,
      channels,
      fileSampleRate,
      targetSampleRate,
      decodeDuration,
      this._fileIsDSD
    )

    this.processor = new AudioProcessor({
      engine: this,
      targetSampleRate,
      channels,
      playbackRate,
      startTime: displayStartTime
    })

    this.ffmpegProcess.pipe(this.processor)

    // 【绝对安全隔离】：如果用户没开 VST，这里走的回退分支与以前的代码 100% 一致！不影响任何正常用户
    if (this.vstBridge && this.vstBridge.enabled) {
      this.vstBridge.pipe(this.processor, this._outputSink, targetSampleRate, channels)
    } else {
      this.processor.pipe(this._outputSink)
    }

    this._outputSink.start()
    this.isPlaying = true
    return { success: true }
  }

  /**
   * Set up the FFmpeg decode process (shared by both paths).
   */
  _setupFFmpeg(
    filePath,
    startTime,
    playbackRate,
    channels,
    fileSampleRate,
    targetSampleRate,
    duration = null,
    isDsdSource = false
  ) {
    this.ffmpegProcess = this._createFfmpegCommand(
      filePath,
      startTime,
      playbackRate,
      channels,
      fileSampleRate,
      targetSampleRate,
      duration,
      isDsdSource
    )
  }

  _createFfmpegCommand(
    filePath,
    startTime,
    playbackRate,
    channels,
    fileSampleRate,
    targetSampleRate,
    duration = null,
    isDsdSource = false
  ) {
    const filters = []
    if (isDsdSource) {
      filters.push(`volume=${DSD_PCM_GAIN_DB}dB`)
    }
    if (playbackRate !== 1.0) {
      const ncRate = Math.round(targetSampleRate * playbackRate)
      filters.push(`aresample=${targetSampleRate}`)
      filters.push(`asetrate=${ncRate}`)
      filters.push(`aresample=${targetSampleRate}`)
    } else if (fileSampleRate !== targetSampleRate) {
      filters.push(`aresample=${targetSampleRate}`)
    }

    const inputOptions = /^https?:\/\//i.test(filePath)
      ? isNeteaseStreamUrl(filePath)
        ? ['-user_agent', NETEASE_UA, '-headers', NETEASE_HEADERS]
        : ['-user_agent', 'EchoesStudio/1.0']
      : []
    const command = applyFfmpegInputOptions(ffmpeg(filePath), inputOptions)
      .seekInput(startTime)
      .format('f32le')
      .audioChannels(channels)
      .audioFrequency(targetSampleRate)
    if (Number(duration) > 0) {
      command.duration(Number(duration))
    }

    if (filters.length > 0) command.audioFilters(filters)

    command.on('error', (err) => {
      if (!err.message.includes('SIGKILL')) console.error('[FFmpeg] Error:', err.message)
    })

    return command
  }

  setVolume(vol) {
    this._userVolume = vol
    this.volume = vol
    if (
      this._directNativePipe &&
      Math.abs((Number(vol) || 0) - (Number(this._directNativePipeVolume) || 0)) > 0.005
    ) {
      this._directNativePipeVolume = vol
      this._scheduleDirectNativePipeRestart('volume-changed')
    }
  }
  getVolume() {
    return this._userVolume
  }

  startFadeOut(durationMs, onComplete) {
    this._clearFadeInterval()
    const totalMs = Math.max(0, Number(durationMs) || 0)
    const startVolume = Math.max(0, Number(this.volume) || 0)
    if (totalMs <= 0) {
      this.volume = 0
      if (typeof onComplete === 'function') onComplete()
      return
    }

    const startAt = Date.now()
    this._fadeInterval = setInterval(() => {
      const elapsed = Date.now() - startAt
      const progress = Math.min(1, elapsed / totalMs)
      this.volume = Math.max(0, startVolume * (1 - progress))
      if (progress >= 1) {
        this._clearFadeInterval()
        this.volume = 0
        if (typeof onComplete === 'function') onComplete()
      }
    }, 50)
  }

  startFadeIn(durationMs) {
    this._clearFadeInterval()
    const totalMs = Math.max(0, Number(durationMs) || 0)
    const targetVol = this._userVolume ?? 1.0
    if (totalMs <= 0) {
      this.volume = targetVol
      return
    }

    this.volume = 0
    const startAt = Date.now()
    this._fadeInterval = setInterval(() => {
      const elapsed = Date.now() - startAt
      const progress = Math.min(1, elapsed / totalMs)
      this.volume = Math.min(targetVol, targetVol * progress)
      if (progress >= 1) {
        this._clearFadeInterval()
        this.volume = targetVol
      }
    }, 50)
  }

  cancelFade() {
    this._clearFadeInterval()
    this.volume = this._userVolume ?? 1.0
  }

  async setPlaybackRate(rate) {
    if (this.currentFilePath && Math.abs(this.playbackRate - rate) > 0.01) {
      return this.play(this.currentFilePath, this.playbackTime, rate)
    }
  }

  async seek(filePath, startTime = 0, playbackRate = this.playbackRate, shouldPlay = this.isPlaying) {
    const nextTime = Math.max(0, Number(startTime) || 0)
    const nextRate = Number(playbackRate) > 0 ? Number(playbackRate) : this.playbackRate || 1.0
    let targetPath = filePath || this.currentFilePath

    if (shouldPlay && targetPath) {
      return this.play(targetPath, nextTime, nextRate)
    }

    while (this._playLocked) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    this._playLocked = true

    try {
      this._cancelPrebuffer()
      this.cancelAutomix()
      this.cancelFade()
      await this._releaseResources()

      if (/^https?:\/\//i.test(targetPath || '')) targetPath = normalizeStreamUri(targetPath)
      if (targetPath) this.currentFilePath = targetPath
      this.playbackRate = nextRate
      this.playbackTime = nextTime
      this.isPlaying = false
      return { success: true, paused: true, currentTime: this.playbackTime }
    } finally {
      this._playLocked = false
    }
  }

  async pause() {
    if (this.isPlaying) {
      this.cancelFade()
      if (this._bridge) {
        this.playbackTime = this._bridge.getPosition()
      }
      console.log(`[AudioEngine] Pausing at ${this.playbackTime}`)
      this.isPlaying = false
      await this._releaseResources()
    }
  }

  resume() {
    if (!this.isPlaying && this.currentFilePath) {
      console.log(`[AudioEngine] Resuming from ${this.playbackTime}`)
      this.play(this.currentFilePath, this.playbackTime, this.playbackRate)
    }
  }

  async stop() {
    this._cancelPrebuffer()
    this.cancelAutomix()
    this.cancelFade()
    this.isPlaying = false
    await this._releaseResources()
    this.currentFilePath = null
    this.playbackTime = 0
  }

  _clearFadeInterval() {
    if (!this._fadeInterval) return
    clearInterval(this._fadeInterval)
    this._fadeInterval = null
  }

  async _releaseResources() {
    if (this._automixState) this.cancelAutomix()
    this._clearDirectNativeVolumeRestartTimer()

    if (this._pcmInputStream) {
      try {
        this._pcmInputStream.destroy()
      } catch {
        /* ignore */
      }
      this._pcmInputStream = null
    }

    if (this.processor) {
      try {
        if (this._outputSink) this.processor.unpipe(this._outputSink)
        this.processor.destroy()
      } catch {
        /* ignore */
      }
      this.processor = null
    }
    this._directNativePipe = false
    this._directNativePipeVolume = 1.0

    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      this.ffmpegProcess = null
    }

    /* ── native bridge cleanup ── */
    if (this._bridge) {
      this._bridge.stop()
      this._bridge = null
      this._outputSink = null
      this._eqProcessor = null
      return
    }

    /* ── legacy naudiodon cleanup ── */
    if (this._outputSink) {
      const ao = this._outputSink
      this._outputSink = null

      if (this.processor) {
        try {
          this.processor.unpipe(ao)
        } catch {
          /* ignore */
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      try {
        console.log('[AudioEngine] Quitting AudioIO...')
        await ao.quit()
        console.log('[AudioEngine] AudioIO quit successfully.')
      } catch (e) {
        console.warn(`[AudioEngine] AudioIO quit failed/ignored: ${e.message}`)
      }
    }
  }

  getStatus() {
    let currentTime = this.playbackTime
    if (this._bridge && this._bridge.isReady) {
      currentTime = this._bridge.getPosition()
      this.playbackTime = currentTime
    }
    const deviceInfo = this._bridge?.deviceInfo
    /* Prefer hardwareSampleRate only for exclusive output. Shared WASAPI has
     * an app-facing bridge rate and a separate final mixer/device rate. */
    const hwSR = deviceInfo && typeof deviceInfo.hardwareSampleRate === 'number'
      ? deviceInfo.hardwareSampleRate
      : 0
    const exclusiveOutput = deviceInfo?.exclusive === true || this._asioMode
    const outSR = exclusiveOutput && hwSR > 0
      ? hwSR
      : (this._deviceOutputSampleRate || this._outputSampleRate || 0)
    const srcSR = this._fileSampleRate
    return {
      isPlaying: this.isPlaying,
      currentTime,
      filePath: this.currentFilePath,
      playbackRate: this.playbackRate,
      exclusive: this._asioMode ? false : this.exclusiveMode,
      exclusiveConfirmed: !!(!this._asioMode && deviceInfo && deviceInfo.exclusive === true),
      asio: this._asioMode,
      nativeBridge: this._useNativeBridge,
      automix: !!this._automixState,
      fileSampleRate: srcSR,
      outputSampleRate: outSR,
      codec: this._fileCodec,
      bitsPerSample: this._fileBitsPerSample,
      isDSD: this._fileIsDSD,
      dsdRate: this._fileDsdRate,
      bitPerfect: srcSR > 0 && outSR > 0 && srcSR === outSR && !this._fileIsDSD,
      useEQ: !!(this.eqConfig && this.eqConfig.useEQ)
    }
  }

  async _getFileInfo(filePath) {
    filePath = getCueAudioPath(filePath)
    if (/^https?:\/\//i.test(filePath)) {
      return {
        sampleRate: 44100,
        channels: 2,
        bitsPerSample: 16,
        codec: 'stream',
        lossless: false,
        isDSD: false
      }
    }
    // Cache to avoid re-parsing the same file on every play() call.
    // DSD files (dsf/dff) are especially slow to parse — caching eliminates
    // the stutter on second+ play of the same track.
    if (!this._fileInfoCache) this._fileInfoCache = new Map()
    const cached = this._fileInfoCache.get(filePath)
    if (cached) return cached

    try {
      const { parseFile } = await import('music-metadata')
      const meta = await parseFile(filePath, { duration: false })
      const codecName = (meta.format.codec || meta.format.container || '').toLowerCase()
      const fileSizeBytes = getLocalFileSizeBytes(filePath)
      const needsProbe = shouldUseFfmpegAudioInfo(filePath, meta, codecName, { fileSizeBytes })
      const probed = needsProbe ? await getFfmpegAudioInfo(filePath) : null
      const preferProbed = shouldPreferFfmpegAudioInfo(filePath, meta, probed, {
        fileSizeBytes,
        codecLabel: codecName
      })
      const isDSD = /dsd/.test(codecName) || /\.(dsf|dff)$/i.test(filePath)
      const codec =
        /alac/i.test(codecName) || /alac/i.test(probed?.codec || '')
          ? 'ALAC'
          : preferProbed && probed?.codec
            ? probed.codec
            : meta.format.container || probed?.codec || 'unknown'
      const result = {
        sampleRate: preferProbed
          ? probed?.sampleRate || meta.format.sampleRate || 44100
          : meta.format.sampleRate || probed?.sampleRate || 44100,
        channels: preferProbed
          ? probed?.channels || meta.format.numberOfChannels || 2
          : meta.format.numberOfChannels || probed?.channels || 2,
        bitsPerSample: preferProbed
          ? probed?.bitDepth || meta.format.bitsPerSample || (isDSD ? 1 : 16)
          : meta.format.bitsPerSample || probed?.bitDepth || (isDSD ? 1 : 16),
        codec,
        lossless: !!meta.format.lossless || /^(alac|flac|wav|aiff|ape)$/i.test(codec) || isDSD,
        isDSD
      }
      this._fileInfoCache.set(filePath, result)
      trimMapCache(this._fileInfoCache, MAX_FILE_INFO_CACHE_ENTRIES)
      return result
    } catch (e) {
      console.warn('[AudioEngine] _getFileInfo failed, using defaults:', e?.message)
      return {
        sampleRate: 44100,
        channels: 2,
        bitsPerSample: 16,
        codec: 'unknown',
        lossless: false,
        isDSD: false
      }
    }
  }
}

export const audioEngine = new AudioEngine()
