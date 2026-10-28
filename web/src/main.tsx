import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { AppShell } from './AppShell'
import { fibrexTheme } from './theme'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'
import '@mantine/notifications/styles.css'
import './styles.css'

const savedTheme = localStorage.getItem('fibrex-theme')
let initialTheme: 'light' | 'dark'
if (savedTheme === 'light' || savedTheme === 'dark') {
  initialTheme = savedTheme
} else {
  initialTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider
      theme={fibrexTheme}
      defaultColorScheme={initialTheme}
    >
      <Notifications position="top-right" />
      <AppShell />
    </MantineProvider>
  </StrictMode>,
)
