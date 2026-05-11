﻿﻿﻿import { useState, useRef, useEffect, useCallback } from 'react'

export default function BgImageEditor({
  imageDataUrl,
  initialOpacity = 72,
  initialBlur = 0,
  initialEditState,
  viewportW,
  viewportH,
  t,
  onPreview,
  onSave,
  onClose
}) {
  const previewW = 320
  const previewH = Math.round(320 * viewportH / viewportW)

  const initPos = (() => {
    if (!initialEditState?.natW || !initialEditState?.natH) {
      return { x: 0, y: 0 }
    }
    const natW = initialEditState.natW || 1
    const natH = initialEditState.natH || 1
    const z = (initialEditState.zoomPct || 100) / 100
    const vFill = Math.max(viewportW / natW, viewportH / natH)
    const pFill = Math.max(previewW / natW, previewH / natH)
    const mainImgW = natW * vFill * z
    const previewImgW = natW * pFill * z
    const ratio = previewImgW / mainImgW
    return {
      x: (initialEditState.posX || 0) * ratio,
      y: (initialEditState.posY || 0) * ratio
    }
  })()

  const [zoom, setZoom] = useState(initialEditState?.zoomPct ?? 100)
  const [opacity, setOpacity] = useState(initialOpacity)
  const [blur, setBlur] = useState(initialBlur)
  const [posX, setPosX] = useState(initPos.x)
  const [posY, setPosY] = useState(initPos.y)
  const [natW, setNatW] = useState(initialEditState?.natW ?? 0)
  const [natH, setNatH] = useState(initialEditState?.natH ?? 0)
  const previewRef = useRef(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const imgRef = useRef(null)

  const previewFillScale = natW && natH
    ? Math.max(previewW / natW, previewH / natH)
    : 1

  const previewToViewportRatio = natW && natH
    ? Math.max(previewW / natW, previewH / natH) / Math.max(viewportW / natW, viewportH / natH)
    : 1

  useEffect(() => {
    if (onPreview) {
      onPreview({
        zoom,
        opacity,
        blur,
        posX: posX / previewToViewportRatio,
        posY: posY / previewToViewportRatio,
        natW,
        natH
      })
    }
  }, [zoom, opacity, blur, posX, posY, natW, natH, previewToViewportRatio, onPreview])

  const handleImgLoad = useCallback((e) => {
    const img = e.target
    setNatW(img.naturalWidth)
    setNatH(img.naturalHeight)
  }, [])

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startPosX = posX
    const startPosY = posY

    const onMove = (ev) => {
      setPosX(startPosX + ev.clientX - startX)
      setPosY(startPosY + ev.clientY - startY)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [posX, posY])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -5 : 5
    setZoom((prev) => Math.min(Math.max(prev + delta, 10), 400))
  }, [])

  const autoFit = useCallback(() => {
    setZoom(100)
    setPosX(0)
    setPosY(0)
  }, [])

  const reset = useCallback(() => {
    setZoom(100)
    setOpacity(72)
    setBlur(0)
    setPosX(0)
    setPosY(0)
  }, [])

  const save = useCallback(() => {
    if (!natW || !natH) {
      onSave({ opacity, blur, editState: null })
      return
    }
    const z = zoom / 100
    const pFill = Math.max(previewW / natW, previewH / natH)
    const vFill = Math.max(viewportW / natW, viewportH / natH)
    const previewImgW = natW * pFill * z
    const mainImgW = natW * vFill * z
    const ratio = mainImgW / previewImgW
    const editState = {
      zoomPct: zoom,
      posX: posX * ratio,
      posY: posY * ratio,
      vw: viewportW,
      vh: viewportH,
      natW,
      natH
    }
    onSave({ opacity, blur, editState })
  }, [zoom, opacity, blur, posX, posY, previewW, previewH, viewportW, viewportH, natW, natH, onSave])

  const scaledZoom = zoom / 100 * previewFillScale
  const imgW = natW * scaledZoom
  const imgH = natH * scaledZoom

  const imgStyle = {
    position: 'absolute',
    width: `${imgW}px`,
    height: `${imgH}px`,
    left: `${(previewW - imgW) / 2 + posX}px`,
    top: `${(previewH - imgH) / 2 + posY}px`,
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
    opacity: opacity / 100,
    pointerEvents: 'none',
    userSelect: 'none'
  }

  return (
    <div className="bg-editor-overlay" onClick={onClose}>
      <div className="bg-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bg-editor-header">
          <h2>{t('settings.bgEditor.title')}</h2>
          <button className="bg-editor-close" onClick={onClose}>&times;</button>
        </div>
        <div className="bg-editor-layout">
          <div className="bg-editor-preview-col">
            <div
              ref={previewRef}
              className="bg-editor-preview"
              style={{ width: `${previewW}px`, height: `${previewH}px` }}
              onMouseDown={handleMouseDown}
              onWheel={handleWheel}
            >
              <div className="bg-editor-layer">
                <img
                  ref={imgRef}
                  src={imageDataUrl}
                  alt=""
                  style={imgStyle}
                  onLoad={handleImgLoad}
                  draggable={false}
                />
              </div>
            </div>
            <span className="bg-editor-preview-label">{t('settings.bgEditor.previewLabel')}</span>
          </div>
          <div className="bg-editor-controls">
            <div className="bg-editor-zoom-row">
              <button
                className="bg-editor-btn-small bg-editor-action-btn"
                onClick={() => setZoom((prev) => Math.max(prev - 10, 10))}
              >
                -
              </button>
              <div className="bg-editor-ctrl-row" style={{ flex: 1 }}>
                <label>{t('settings.bgEditor.zoom')}</label>
                <input
                  type="range"
                  min={10}
                  max={400}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </div>
              <button
                className="bg-editor-btn-small bg-editor-action-btn"
                onClick={() => setZoom((prev) => Math.min(prev + 10, 400))}
              >
                +
              </button>
              <span className="bg-editor-ctrl-value">{zoom}%</span>
            </div>
            <div className="bg-editor-ctrl-row">
              <label>{t('settings.bgEditor.opacity')}</label>
              <input
                type="range"
                min={5}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
              <span className="bg-editor-ctrl-value">{opacity}%</span>
            </div>
            <div className="bg-editor-ctrl-row">
              <label>{t('settings.bgEditor.blur')}</label>
              <input
                type="range"
                min={0}
                max={40}
                value={blur}
                onChange={(e) => setBlur(Number(e.target.value))}
              />
              <span className="bg-editor-ctrl-value">{blur}px</span>
            </div>
            <div className="bg-editor-ctrl-row">
              <label>{t('settings.bgEditor.offset')}</label>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, opacity: 0.7 }}>
                <span>X: {Math.round(posX)}</span>
                <span>Y: {Math.round(posY)}</span>
              </div>
            </div>
            <div className="bg-editor-actions">
              <button className="bg-editor-btn-text" onClick={autoFit}>
                {t('settings.bgEditor.autoFit')}
              </button>
              <button className="bg-editor-btn-text" onClick={reset}>
                {t('settings.bgEditor.reset')}
              </button>
              <button className="bg-editor-btn-save" onClick={save}>
                {t('settings.bgEditor.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
