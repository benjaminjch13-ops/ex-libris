import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyTheme, type ThemeId } from './lib/themes'

// paint the saved theme before the first frame
try { applyTheme((localStorage.getItem('exl-theme') as ThemeId | null) ?? 'nocturna') } catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
