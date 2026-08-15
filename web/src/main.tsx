import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from './AppShell'
import './styles.css'

const savedTheme = localStorage.getItem('fibrex-theme')
let initialTheme = savedTheme
if (initialTheme !== 'light' && initialTheme !== 'dark') {
  initialTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
)
