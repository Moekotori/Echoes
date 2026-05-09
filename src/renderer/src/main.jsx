import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App'
import PluginHostProvider from './plugins/PluginHost'
import RendererErrorBoundary from './RendererErrorBoundary'
import './index.css'
import './styles/tokens.css'
import './styles/echo-tokens.css'
import './styles/echo-track-list.css'

const LyricsDesktop = lazy(() => import('./LyricsDesktop'))
const MiniPlayerWindow = lazy(() => import('./MiniPlayerWindow'))

function reportRendererDiagnostic(kind, payload = {}) {
  try {
    window.api?.reportRendererDiagnostic?.({
      kind,
      at: new Date().toISOString(),
      url: window.location.href,
      title: document.title,
      visibilityState: document.visibilityState,
      rendererMode: new URLSearchParams(window.location.search).get('mode') || 'main',
      rootChildCount: document.getElementById('root')?.childElementCount || 0,
      memory:
        performance?.memory && typeof performance.memory === 'object'
          ? {
              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
              usedJSHeapSize: performance.memory.usedJSHeapSize
            }
          : null,
      ...payload
    })
  } catch {
    /* best-effort diagnostics */
  }
}

window.addEventListener('error', (event) => {
  reportRendererDiagnostic('window-error', {
    message: event.message || '',
    filename: event.filename || '',
    lineno: event.lineno || 0,
    colno: event.colno || 0,
    stack: event.error?.stack || ''
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  reportRendererDiagnostic('unhandled-rejection', {
    message: reason?.message || String(reason || ''),
    stack: reason?.stack || ''
  })
})

document.addEventListener('visibilitychange', () => {
  reportRendererDiagnostic('visibilitychange')
})

document.addEventListener(
  'click',
  (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    reportRendererDiagnostic('user-click', {
      tagName: target.tagName,
      className: typeof target.className === 'string' ? target.className.slice(0, 180) : '',
      text: String(target.textContent || '').trim().slice(0, 120)
    })
  },
  true
)

document.addEventListener(
  'keydown',
  (event) => {
    reportRendererDiagnostic('user-keydown', {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    })
  },
  true
)

window.setInterval(() => {
  reportRendererDiagnostic('heartbeat')
}, 15000)

const rendererMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mode')
const desktopMode = rendererMode === 'lyrics-desktop'
const miniPlayerMode = rendererMode === 'mini-player'

const floatingWindowFallback = (
  <div
    style={{
      minHeight: '100vh',
      margin: 0,
      background: 'transparent'
    }}
  />
)

ReactDOM.createRoot(document.getElementById('root')).render(
  desktopMode ? (
    <Suspense fallback={floatingWindowFallback}>
      <LyricsDesktop />
    </Suspense>
  ) : miniPlayerMode ? (
    <Suspense fallback={floatingWindowFallback}>
      <MiniPlayerWindow />
    </Suspense>
  ) : (
    <React.StrictMode>
      <RendererErrorBoundary>
        <PluginHostProvider>
          <App />
        </PluginHostProvider>
      </RendererErrorBoundary>
    </React.StrictMode>
  )
)
