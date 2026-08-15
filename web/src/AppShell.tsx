import { useEffect, useState } from 'react'
import { getAuthSession, login, logout } from './api'
import { App } from './App'
import { LoginPage } from './components/LoginPage'

type AuthState = 'loading' | 'authenticated' | 'anonymous'

export function AppShell() {
  const [state, setState] = useState<AuthState>('loading')

  useEffect(() => {
    void getAuthSession()
      .then((session) => setState(session.authenticated ? 'authenticated' : 'anonymous'))
      .catch(() => setState('anonymous'))
    const requireLogin = () => setState('anonymous')
    window.addEventListener('fibrexwatch-auth-required', requireLogin)
    return () => window.removeEventListener('fibrexwatch-auth-required', requireLogin)
  }, [])

  if (state === 'loading')
    return (
      <main className="login-page">
        <p>Loading FibreXWatch</p>
      </main>
    )
  if (state === 'anonymous') {
    return (
      <LoginPage
        onLogin={async (username, password) => {
          await login(username, password)
          setState('authenticated')
        }}
      />
    )
  }
  return (
    <App
      onLogout={async () => {
        await logout()
        setState('anonymous')
      }}
    />
  )
}
