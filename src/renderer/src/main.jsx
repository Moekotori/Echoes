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
