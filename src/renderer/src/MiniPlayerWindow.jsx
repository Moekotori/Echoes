import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Music, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { buildMiniPlayerPayload, buildMiniPlayerPayloadSignature } from './utils/miniPlayerPayload'

const EMPTY_PAYLOAD = buildMiniPlayerPayload({
  title: '\u8bf7\u9009\u62e9\u6b4c\u66f2',
  artist: 'ECHO',
  volume: 1
})

function clampVolume(value) {
  const next = Number(value)
  if (!Number.isFinite(next)) return 1
  return Math.min(1, Math.max(0, next))
}

function formatArtist(value) {
  const text = String(value || '').trim()
  if (!text || text === '\u2014') return '\u672a\u77e5\u827a\u4eba'
  return text
}

function estimateMiniPlayerPosition(playback, nowMs) {
  const position = Math.max(0, Number(playback?.position) || 0)
  const duration = Math.max(0, Number(playback?.duration) || 0)
  if (!playback?.isPlaying || duration <= 0) return Math.min(position, duration || position)
  const updatedAtMs = Number(playback?.updatedAtMs) || 0
  if (updatedAtMs <= 0) return Math.min(position, duration || position)
  const elapsedSec = Math.max(0, (nowMs - updatedAtMs) / 1000)
  return Math.min(duration, position + elapsedSec)
}

export default function MiniPlayerWindow() {
  const [payload, setPayload] = useState(EMPTY_PAYLOAD)
  const [clockTick, setClockTick] = useState(() => Date.now())
  const lastPayloadSignatureRef = useRef(buildMiniPlayerPayloadSignature(EMPTY_PAYLOAD))

  const track = payload.track || EMPTY_PAYLOAD.track
  const playback = payload.playback || EMPTY_PAYLOAD.playback

  useEffect(() => {
    if (!window.api?.onMiniPlayerData) return undefined
    const off = window.api.onMiniPlayerData((next) => {
      const normalized = buildMiniPlayerPayload(next || EMPTY_PAYLOAD)
      const signature = buildMiniPlayerPayloadSignature(normalized)
      if (signature === lastPayloadSignatureRef.current) return
      lastPayloadSignatureRef.current = signature
      setPayload(normalized)
      setClockTick(Date.now())
    })
    window.api.notifyMiniPlayerReady?.()
    return off
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        window.api?.dismissMiniPlayer?.()
      }
      if (event.code === 'Space') {
        event.preventDefault()
        window.api?.miniPlayerCommand?.('togglePlay')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 关键优化:计时器只依赖 isPlaying 与 duration 是否合法两个布尔状态,
  // 不再把 position / updatedAtMs 放入依赖。否则主进程每发一次 payload
  // (每秒数次),整个 setInterval 就会被重建一次,等于在做无谓的重启,
  // 而且会立刻重置 1 秒节拍 → 进度条/时间显示出现毛刺,CPU 也跟着抖。
  // 真正的位置由 estimateMiniPlayerPosition 用 ref 化的 playback 推算。
  const hasValidDuration = Number(playback.duration) > 0
  useEffect(() => {
    if (!playback.isPlaying || !hasValidDuration) return undefined
    const timer = window.setInterval(() => {
      setClockTick(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [playback.isPlaying, hasValidDuration])

  const title = track.title || EMPTY_PAYLOAD.track.title
  const artist = formatArtist(track.artist)
  const safeVolume = clampVolume(playback.volume)
  const estimatedPosition = useMemo(
    () => estimateMiniPlayerPosition(playback, clockTick),
    [clockTick, playback]
  )
  const progress = useMemo(() => {
    const duration = Number(playback.duration) || 0
    if (duration <= 0) return 0
    return Math.min(100, Math.max(0, (estimatedPosition / duration) * 100))
  }, [estimatedPosition, playback.duration])

  const send = (command, data = {}) => {
    window.api?.miniPlayerCommand?.(command, data)
  }

  return (
    <div className="mini-player-shell">
      <div className="mini-player-card">
        <div className="mini-player-cover" aria-hidden>
          {track.cover ? <img src={track.cover} alt="" draggable={false} /> : <Music size={23} />}
          <span className="mini-player-cover-ring" />
        </div>

        <div className="mini-player-main">
          <div className="mini-player-title" title={title}>
            {title}
          </div>
          <div className="mini-player-artist" title={artist}>
            {artist}
          </div>
          <div className="mini-player-progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mini-player-controls">
          <button
            type="button"
            title="\u4e0a\u4e00\u9996"
            aria-label="\u4e0a\u4e00\u9996"
            onClick={() => send('previous')}
          >
            <SkipBack size={16} />
          </button>
          <button
            type="button"
            className="mini-player-play"
            aria-pressed={playback.isPlaying}
            title={playback.isPlaying ? '\u6682\u505c' : '\u64ad\u653e'}
            aria-label={playback.isPlaying ? '\u6682\u505c' : '\u64ad\u653e'}
            onClick={() => send('togglePlay')}
          >
            {playback.isPlaying ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            title="\u4e0b\u4e00\u9996"
            aria-label="\u4e0b\u4e00\u9996"
            onClick={() => send('next')}
          >
            <SkipForward size={16} />
          </button>
          <button
            type="button"
            className={track.liked ? 'is-liked' : ''}
            title={track.liked ? '\u53d6\u6d88\u559c\u6b22' : '\u559c\u6b22'}
            aria-label={track.liked ? '\u53d6\u6d88\u559c\u6b22' : '\u559c\u6b22'}
            onClick={() => send('toggleLike')}
          >
            <Heart size={16} fill={track.liked ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="mini-player-volume">
          <Volume2 size={14} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={safeVolume}
            title="\u97f3\u91cf"
            aria-label="\u97f3\u91cf"
            onChange={(event) => send('setVolume', { volume: clampVolume(event.target.value) })}
            style={{ '--mini-volume': `${safeVolume * 100}%` }}
          />
        </div>

        <div className="mini-player-window-actions">
          <button
            type="button"
            title="\u5173\u95ed"
            aria-label="\u5173\u95ed"
            onClick={() => window.api?.dismissMiniPlayer?.()}
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <style>{`
        :root {
          --mini-player-width: 412px;
          --mini-player-height: 68px;
          color-scheme: light;
          font-family: "Inter", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
        }

        html,
        body,
        #root {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
          background: #f7fbfb;
        }

        body,
        #root {
          display: grid;
          place-items: center;
        }

        button,
        input {
          font: inherit;
        }

        .mini-player-shell {
          width: min(100vw, var(--mini-player-width));
          height: min(100vh, var(--mini-player-height));
          box-sizing: border-box;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f7fbfb;
        }

        .mini-player-card {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 44px minmax(72px, 1fr) auto 76px 22px;
          align-items: center;
          gap: 8px;
          padding: 5px 8px;
          border-radius: 16px;
          color: #24323f;
          background:
            linear-gradient(135deg, #ffffff, #eef8f7),
            linear-gradient(90deg, rgba(52, 183, 173, 0.08), rgba(221, 110, 157, 0.05));
          border: 1px solid rgba(197, 218, 220, 0.72);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.94),
            inset 0 -1px 0 rgba(43, 74, 85, 0.06);
          -webkit-app-region: drag;
          user-select: none;
        }

        .mini-player-cover {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          overflow: hidden;
          color: rgba(44, 117, 111, 0.82);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(52, 183, 173, 0.2)),
            rgba(255, 255, 255, 0.5);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.78),
            inset 0 -8px 18px rgba(42, 82, 92, 0.1);
          flex-shrink: 0;
        }

        .mini-player-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .mini-player-cover-ring {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 0 0 1px rgba(33, 60, 70, 0.09);
          pointer-events: none;
        }

        .mini-player-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 1px;
        }

        .mini-player-title,
        .mini-player-artist {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: 0;
        }

        .mini-player-title {
          font-size: 12px;
          line-height: 1.2;
          font-weight: 850;
          color: #1d303b;
        }

        .mini-player-artist {
          font-size: 10px;
          line-height: 1.1;
          font-weight: 650;
          color: rgba(54, 76, 88, 0.66);
        }

        .mini-player-progress {
          height: 2px;
          margin-top: 5px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(43, 72, 84, 0.1);
        }

        .mini-player-progress span {
          display: block;
          height: 100%;
          min-width: 2px;
          max-width: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #2fb5aa, #74bdd2);
        }

        .mini-player-controls,
        .mini-player-window-actions,
        .mini-player-volume {
          -webkit-app-region: no-drag;
        }

        .mini-player-controls {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .mini-player-controls button,
        .mini-player-window-actions button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          cursor: pointer;
          color: rgba(43, 65, 78, 0.72);
          background: transparent;
          box-shadow: none;
          transition:
            transform 150ms ease,
            color 150ms ease,
            background 150ms ease,
            box-shadow 150ms ease;
        }

        .mini-player-controls button {
          width: 26px;
          height: 26px;
          border-radius: 999px;
        }

        .mini-player-controls button:hover,
        .mini-player-window-actions button:hover {
          color: #17343b;
          background: rgba(47, 183, 173, 0.1);
        }

        .mini-player-controls .mini-player-play {
          width: 30px;
          height: 30px;
          margin: 0 2px;
          color: #ffffff;
          background: linear-gradient(135deg, #2fb7ad, #70bed1);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }

        .mini-player-controls .mini-player-play:hover {
          background: linear-gradient(135deg, #34c4b8, #7ec6d8);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
          transform: translateY(-0.5px);
        }

        .mini-player-controls .mini-player-play svg {
          margin-left: 1px;
        }

        .mini-player-controls .is-liked {
          color: #e0497a;
        }

        .mini-player-controls .is-liked:hover {
          color: #cf3154;
          background: rgba(224, 73, 122, 0.1);
        }

        .mini-player-volume {
          min-width: 0;
          height: 24px;
          display: flex;
          align-items: center;
          gap: 7px;
          color: rgba(42, 66, 78, 0.62);
        }

        .mini-player-volume input {
          flex: 1;
          min-width: 0;
          height: 16px;
          margin: 0;
          cursor: pointer;
          appearance: none;
          background: transparent;
        }

        .mini-player-volume input::-webkit-slider-runnable-track {
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            #36b7ad 0 var(--mini-volume),
            rgba(48, 74, 86, 0.16) var(--mini-volume) 100%
          );
        }

        .mini-player-volume input::-webkit-slider-thumb {
          appearance: none;
          width: 11px;
          height: 11px;
          margin-top: -4px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #35b6ad;
          box-shadow: 0 1px 3px rgba(31, 121, 115, 0.28);
        }

        .mini-player-window-actions {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mini-player-window-actions button {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          opacity: 0.55;
          background: transparent;
        }

        .mini-player-window-actions button:hover {
          opacity: 1;
          color: #b91c3b;
          background: rgba(224, 73, 122, 0.12);
        }
      `}</style>
    </div>
  )
}
