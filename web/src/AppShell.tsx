import { useEffect, useState } from 'react'
import { Center, Loader, Stack, Text } from '@mantine/core'
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
      <Center mih="100vh">
        <Stack
          align="center"
          gap="sm"
        >
          <Loader color="mtn" />
          <Text
            c="dimmed"
            size="sm"
          >
            Loading FibreXWatch
          </Text>
        </Stack>
      </Center>
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
