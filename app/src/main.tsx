import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Keeps --visual-viewport-height (see index.css) in sync with the real,
// current viewport. A static 100dvh assumes the viewport never changes
// after first paint, but measurement showed that assumption can fail:
// dvh resolved through a CSS custom property doesn't reliably re-resolve
// on every viewport change the way a literal `height: 100dvh` does, so a
// stale value can desync from reality and misplace centered dialogs.
// Driving it explicitly removes the dependency on that behavior.
function syncVisualViewportHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`)
}
syncVisualViewportHeight()
window.visualViewport?.addEventListener('resize', syncVisualViewportHeight)
window.addEventListener('resize', syncVisualViewportHeight)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
