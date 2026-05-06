import React, { useEffect, useMemo, useState } from 'react'
import { Heart, Music, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { buildMiniPlayerPayload } from './utils/miniPlayerPayload'

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

export default function MiniPlayerWindow() {
  const [payload, setPayload] = useState(EMPTY_PAYLOAD)

  useEffect(() => {
    if (!window.api?.onMiniPlayerData) return undefined
    const off = window.api.onMiniPlayerData((next) => {
      setPayload(buildMiniPlayerPayload(next || EMPTY_PAYLOAD))
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

  const track = payload.track || EMPTY_PAYLOAD.track
  const playback = payload.playback || EMPTY_PAYLOAD.playback
  const title = track.title || EMPTY_PAYLOAD.track.title
  const artist = formatArtist(track.artist)
  const safeVolume = clampVolume(playback.volume)
  const progress = useMemo(() => {
    const duration = Number(playback.duration) || 0
    if (duration <= 0) return 0
    return Math.min(100, Math.max(0, ((Number(playback.position) || 0) / duration) * 100))
  }, [playback.duration, playback.position])

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
          background: transparent;
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
          background: transparent;
        }

        .mini-player-card {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 44px minmax(84px, 1fr) auto 66px 22px;
          align-items: center;
          gap: 7px;
          padding: 5px 7px;
          border-radius: 16px;
          color: #24323f;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(239, 250, 249, 0.88)),
            linear-gradient(90deg, rgba(52, 183, 173, 0.12), rgba(221, 110, 157, 0.08));
          border: 1px solid rgba(197, 218, 220, 0.72);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.94),
            inset 0 -1px 0 rgba(43, 74, 85, 0.06);
          -webkit-backdrop-filter: blur(20px) saturate(1.16);
          backdrop-filter: blur(20px) saturate(1.16);
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
          gap: 3px;
          padding: 2px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.5);
          box-shadow: inset 0 0 0 1px rgba(207, 222, 224, 0.68);
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
            background 150ms ease;
        }

        .mini-player-controls button {
          width: 24px;
          height: 24px;
          border-radius: 999px;
        }

        .mini-player-controls button:hover,
        .mini-player-window-actions button:hover {
          transform: translateY(-1px);
          color: #17343b;
          background: rgba(255, 255, 255, 0.76);
        }

        .mini-player-controls .mini-player-play {
          width: 31px;
          height: 31px;
          color: #ffffff;
          background: linear-gradient(135deg, #2fb7ad, #70bed1);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.28),
            inset 0 -1px 0 rgba(21, 85, 91, 0.18);
        }

        .mini-player-controls .mini-player-play svg {
          margin-left: 1px;
        }

        .mini-player-controls .is-liked {
          color: #cf3154;
          background: rgba(255, 244, 247, 0.86);
        }

        .mini-player-volume {
          min-width: 0;
          height: 25px;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 6px;
          border-radius: 999px;
          color: rgba(42, 66, 78, 0.68);
          background: rgba(255, 255, 255, 0.46);
          box-shadow: inset 0 0 0 1px rgba(207, 222, 224, 0.68);
        }

        .mini-player-volume input {
          width: 38px;
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
          width: 10px;
          height: 10px;
          margin-top: -3.5px;
          border-radius: 999px;
          border: 2px solid #ffffff;
          background: #35b6ad;
          box-shadow: inset 0 0 0 1px rgba(31, 121, 115, 0.12);
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
          opacity: 0.74;
          background: rgba(255, 255, 255, 0.46);
        }

        .mini-player-window-actions button:hover {
          opacity: 1;
          color: #b91c3b;
          background: rgba(255, 239, 243, 0.82);
        }
      `}</style>
    </div>
  )
}
