# ECHO Next 音频稳定性评测报告

评测日期: 2026-05-17  
评测范围: 本地播放管线 + 流媒体管线 (基于 `D:\ECHONext\ECHO-Next` 当前分支源码)  
评测方式: 静态代码审计 (`native/audio-host`、`src/main/audio`、`src/main/streaming`、`src/main/ipc/playbackIpc.ts`、`src/renderer/components/player`)

---

## 总评

| 维度 | 评分 (10 分制) | 备注 |
| --- | --- | --- |
| 本地播放稳定性 | **8.5** | 看门狗 + 多级 fallback + native 端 FIFO 欠载计数,设计成熟 |
| 流媒体稳定性 | **7.5** | 有缓存/重解析/FFmpeg 重连,但 HLS 支持空缺、过期判定较粗 |
| 错误恢复能力 | **8.0** | 自动降级路径多 (JUCE→FFmpeg、Exclusive→Shared、DoP→PCM、URL→重解析) |
| 可观测性 / 诊断 | **9.0** | `PlaybackStabilityDiagnosticsPanel` 暴露 40+ 字段,native telemetry 完备 |
| 测试覆盖度 | **7.5** | `AudioCore.test.ts` 252 用例,其中 ~80 处覆盖 watchdog/recovery/underrun;但缺少长跑/抖动集成测试 |
| **综合** | **8.0 / 10** | 工程化做得相当扎实,主要短板集中在流媒体协议层 |

---

## 一、本地播放管线的稳定性机制

### 1.1 状态机与运行守卫
`src/main/audio/AudioSession.ts` 是一个 4000+ 行的中枢类,负责:
- 多 token 的 run 取消 (`assertCurrentRun`),保证旧的播放回调不会污染新会话;
- 优雅停止与强制停止两条路径 (`stopResourcesGracefully` / `stopResources`);
- 起播前对采样率方案 (`SampleRatePlan`) 做一致性断言 (`assertReadySampleRateConsistent`),失败时自动尝试 `startSharedFallbackForProbe`。

### 1.2 看门狗 (Watchdog)
- 默认 `watchdogIntervalMs = 2000`,`watchdogStallChecks = 3`,即连续约 6 秒位置不前进 (`watchdogPositionEpsilonSeconds = 0.05`) 才判定为 stall;
- 单曲最多 `watchdogMaxRecoveriesPerTrack = 3` 次恢复,窗口 5 分钟,超出后只能记录 `recovery_limited` 告警,避免恢复风暴;
- 恢复时调用 `recoverOutputStability('audio_watchdog_recovered_native_output', position)`,会重新调用 `playLocalFile` 从当前位置重新拉流。

### 1.3 Native 欠载侦测
`native/audio-host/src/main.cpp` 在音频回调里直接计数:
```
underrunCallbacks.fetch_add(1, ...);
underrunFrames.fetch_add(framesNeeded, ...);
```
当 `juce::AbstractFifo` 在回调里读到不够的帧数时累加,通过 stdout JSON 行 (`position` 事件) 上报给 `NativeOutputBridge`,再触发 `AudioSession.handleNativeTelemetry → checkNativeUnderrunRecovery`:
- 窗口 `nativeUnderrunWindowMs = 15000`,阈值 `nativeUnderrunCallbackThreshold = 3` 次 或 `nativeUnderrunFramesThresholdMs = 100ms` 等价帧数,任一触发即恢复;
- 独占模式 (`exclusive`) 命中阈值会直接降级到 Shared (`fallbackExclusiveToSharedForInstability`),共享模式则进入下一级缓冲档位。

### 1.4 三级共享稳定档位
```
standard  → 2048 帧 / 420ms FIFO / 120ms 预缓冲 / 450ms 启动超时
recovery  → 4096 帧 / 750ms FIFO / 180ms 预缓冲 / 600ms 启动超时
emergency → 8192 帧 / 1200ms FIFO / 240ms 预缓冲 / 800ms 启动超时
```
档位通过 `tierForRecoveryCount` 升级,且会被记忆 5 分钟 (`sharedStabilityMemoryTtlMs`),避免刚恢复就再被同一设备/曲目打回原形。同设备/同 backend 短期内会跳过 standard 直接用记忆里的高档位。

### 1.5 多重 fallback 路径
按降级顺序:
1. **JUCE 解码 → FFmpeg 解码** (`juce_decode_fell_back_to_ffmpeg` 警告);
2. **SoXR 重采样 → 默认重采样器** (`onResamplerFallback`);
3. **DSD DoP → PCM** (`dsd_dop_fell_back_to_pcm:<msg>`);
4. **Exclusive → Shared** (采样率不一致时同步 fallback、运行期抖动时 `exclusive_output_fell_back_to_shared`);
5. **Native 输出失败 → Safe Shared** (`safe-shared-fallback` 阶段)。

每一级都会通过 `reportRecoverableAudioError → CrashReportService` 写入诊断日志。

### 1.6 渲染端进度时钟容错
`src/renderer/components/player/PlayerBar.tsx` 用 `progressClockRef` 做了双向插值:
- `maxInterpolatedStatusGapSeconds = 1.6` 秒以内允许 UI 继续插值,即便 IPC `status` 事件迟到也不会停顿;
- `maxStaleStatusRegressionSeconds = 2.5` 秒以内能忽略陈旧状态导致的进度回跳;
- seek 后有 `seekAnchorMaxAgeSeconds = 3` 秒锚点,防止后端旧值把刚跳转的进度拽回去。

这一层是 ECHO 体验流畅度的关键,无声却很到位。

---

## 二、流媒体稳定性机制

### 2.1 缓存策略
`src/main/streaming/StreamingService.ts`:
- **playback URL** 用 `StreamingMemoryCache`,TTL 由 `playableTtlMs(source)` 算:`min(maxPlaybackTtlMs=5min, expiresAt - now - 30s)`,即提前 30 秒失效,留出重解析窗口;
- 没有 `expiresAt` 的源(如 M3U8 直链)走 `fallbackPlaybackTtlMs = 2min`;
- `getOrCreateInflight` 合并相同 key 的并发请求,避免对 provider 同时打多次。

### 2.2 速率限制
`StreamingRateLimiter` 默认 `maxConcurrent = 2`、`minIntervalMs = 150`,按 provider 维度限流,可以防止网易/QQ 端被风控。

### 2.3 URL 过期自动重解析
`src/main/ipc/playbackIpc.ts:563`:
```ts
if ((item.mediaType !== 'streaming' && item.mediaType !== 'remote') || !isLikelyExpiredUrlError(error)) {
  // 不重试
}
preparedMediaCache.delete(...);
const prepared = await resolveMediaItemForPlayback(request, { forceRefresh: true });
```
`isLikelyExpiredUrlError` 用正则 `/403|404|expired|forbidden|unauthorized|invalid data|server returned|http error/iu` 匹配,匹配到就清缓存重解析。这条路径覆盖了网易短链 (4 分钟)、QQ (4 分钟)、Spotify CDN 等典型场景。

### 2.4 FFmpeg 的网络容错
`src/main/audio/DecoderPipeline.ts:191` 为 http(s) 输入注入:
```
-reconnect 1
-reconnect_streamed 1
-reconnect_at_eof 1
-reconnect_on_network_error 1
-reconnect_delay_max 2
-rw_timeout 30000000   // 30s
```
PCM 启动超时也单独抬高到 `remotePcmStartupTimeoutMs = 30000`。错误分类器 `classifyFfmpegDecodeError` 能把日志归一成 8 类 (`network_error`、`http_expired_or_forbidden`、`pcm_start_timeout` 等),直接驱动上层的恢复策略。

### 2.5 远端代理
`src/main/library/remote/RemoteStreamProxyService.ts` 启动本地 127.0.0.1 HTTP 服务,逐次发放短令牌:
- 完整支持 `Range`、`206`、`416`,以及上游 `Accept-Ranges/Content-Range` 透传 → seek 友好;
- 令牌有效期 6 小时,初次 24 小时,访问时滑动续期;
- 文件适配器走 `createReadStream`,远端走 `fetch` + `Readable.fromWeb`。

### 2.6 Spotify 旁路
`spotifyPlayback.ts` 直接走 Web Playback SDK + Connect API,不进 `AudioSession`。`playbackIpc.ts:364` 显式拒绝 `provider === 'spotify'` 进入 native 路径。优点是 Spotify 内容的 DRM/计费完全由官方负责,稳定性等价于 Spotify 本体;代价是 Spotify 与本地播放走两套时钟,`PlayerBar.tsx:323` 用 1 Hz 轮询同步进度。

---

## 三、风险点与改进建议

### ⚠️ 高优先级
1. **没有真正的 HLS 解码**。`M3u8StreamingProvider` 仅把 M3U/M3U8 当作 *播放列表文本文件* 解析 (`parseM3u8Playlist` 找 `#EXTINF` + http 直链),并不处理 `#EXT-X-TARGETDURATION`、`#EXT-X-MEDIA-SEQUENCE`、Live HLS 滑动窗口、`EXT-X-DISCONTINUITY` 等。一旦真实 HLS 流接入 (常见于电台、直播),只会因 FFmpeg 直接解析 manifest 而表现不稳。建议:对 `application/vnd.apple.mpegurl` 走专门的 HLS 缓冲层,或显式声明不支持 Live HLS 并在 UI 阻挡。
2. **`isLikelyExpiredUrlError` 误判风险**。正则里包含 `invalid data`、`http error` 等较宽的关键词,某些本地坏文件或 codec 错误也会命中 `classifyFfmpegDecodeError → input_invalid`,从而触发一次无意义的 `forceRefresh`。建议改用 `error.ffmpegErrorKind === 'http_expired_or_forbidden'` 这种枚举值精确匹配,而不是字符串正则。
3. **`reconnect_delay_max = 2` 太激进**。在弱网、移动热点切换、Wi-Fi 漫游场景下,2 秒退避后即放弃,容易把短暂网络抖动放大成 `network_error`。建议把指数退避上限抬到 8–10 秒,或者根据 `nativeFifoCapacityFrames` 推断的剩余缓冲时间动态决定上限。

### ⚠️ 中优先级
4. **共享模式失败不会切换 backend**。`recoverOutputStability` 只升级缓冲档位,不会自动从 WASAPI Shared 切到 DirectSound。`README.md` 已说明 DirectSound 仅在用户显式选择时启用,这从音质角度合理,但在某些驱动 bug 场景下用户可能没有自救手段。可以考虑达到 emergency 档位且仍欠载时,提示用户尝试备用 backend。
5. **没有"下一首预拉取"**。`PlayerBar.tsx` 的 `deferNonCriticalPlaybackTask` 只用于 MV 预加载和 BPM 分析,没有看到对 next track 的 `prepare` 调用。在弱网或慢盘场景下,曲目切换的首播延迟可能比预期大。建议在播放进度 >= 80% 时调用 `StreamingService.resolvePlayback` 预热下一首 URL,并 prime FFmpeg moov atom。
6. **Watchdog 上限触达后只警告**。`watchdogMaxRecoveriesPerTrack = 3` 之后会进入 `recovery_limited` 状态但播放还在 "playing",体验上是"卡着不退出"。建议在多次恢复失败后主动切换到 `state = 'error'` 或自动跳下一首。

### ℹ️ 低优先级
7. **`StreamingPlaybackResolver` 几乎空壳** (只有 9 行,把请求转给 provider)。可以考虑把 URL 探活 (HEAD 请求) 放到这层,提前发现 4xx 而不是把错误推到 FFmpeg 启动阶段。
8. **`playableTtlMs` 在 expiresAt 缺失时只用 2 分钟兜底**。M3U8 直链/Mock 等场景下,如果上游签名比 2 分钟短,首次播放就会失败并依赖重解析路径——可以接受,但首播体验会差一拍。
9. **没有发现长跑/抖动集成测试**。`AudioCore.test.ts` 用例数量 252、watchdog/underrun 相关 ~80,单元覆盖良好,但缺少 1 小时级的端到端浸泡测试 (尤其是 emergency 档位记忆与衰退路径)。

---

## 四、可观测性资产盘点 (现成的诊断手段)

`PlaybackStabilityDiagnosticsPanel.tsx` 在 *设置 → 音频* 中提供下列字段 (实时 3s 刷新):
- 输出: `state / host / outputMode / sharedBackend / latencyProfile / outputBackend / outputDeviceName`
- 采样率: `fileSampleRate / decoderOutputSampleRate / requestedOutputSampleRate / actualDeviceSampleRate / sharedDeviceSampleRate / resampling / bitPerfectCandidate / sampleRateMismatch`
- FFmpeg: `ffmpegPath / ffmpegSource / ffmpegVersion / ffmpegHealthy / soxrAvailable / resamplerEngine / resamplerFallbackActive`
- Native: `nativeDeviceBufferFrames / nativeRequestedBufferFrames / nativeActualBufferFrames / nativeOutputLatencyMs / nativePositionStalenessMs / nativeFifoCapacityFrames / nativeStartupPrebufferFrames / nativeBufferedFrames / nativeBufferedMs / nativeUnderrunCallbacks / nativeUnderrunFrames`
- 恢复: `sharedStabilityTier / lastSharedStabilityRecoveryAt / watchdogStatus / recentWatchdogRecoveryCount / lastWatchdogRecoveryTime`
- 错误: `warnings / error`

**评测建议**: 复现卡顿后直接在面板上点 "复制",粘贴出来的快照 (`formatPlaybackDiagnosticsText`) 几乎包含定位所需的所有字段——这是 ECHO 在稳定性工程上做得最漂亮的一块。

---

## 五、结论

ECHO Next 的本地音频管线已经达到 **桌面级专业播放器** 的稳定性标准:state machine + watchdog + native 欠载计数 + 三级缓冲档位 + 多重 fallback,且诊断面板把内部状态打开给用户,工程化分明显高于多数同类项目。

流媒体侧整体可用,**最大的两个缺口是 HLS 协议层与过期错误的判定精度**。如果近期路线图里要支持电台/直播/真 HLS 内容,需要补一层 HLS 缓冲器;否则当前的"播放列表式 M3U8 + FFmpeg `-reconnect`"组合在点播场景下表现已经足够。

按优先级处理建议 1–3 后,流媒体评分预计可以从 7.5 抬到 8.5,综合分进入 8.5+ 区间。
