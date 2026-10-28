import { useState, type FormEvent } from 'react'
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconAlertCircle, IconLock, IconUser } from '@tabler/icons-react'

export function LoginPage({
  onLogin,
}: {
  onLogin: (username: string, password: string) => Promise<void>
}) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onLogin(username.trim(), password)
    } catch {
      setError('The username or password is incorrect.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <Paper
        component="section"
        className="login-card"
        withBorder
        radius="xl"
        shadow="xl"
      >
        <Text className="eyebrow">Home network intelligence</Text>
        <Title order={1}>FibreXWatch</Title>
        <Text c="dimmed">Sign in to view your network usage and connected devices.</Text>
        <form onSubmit={(event) => void submit(event)}>
          <Stack gap="md">
            <TextInput
              label="Username"
              leftSection={<IconUser size={17} />}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <PasswordInput
              label="Password"
              leftSection={<IconLock size={17} />}
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <Alert
                color="red"
                icon={<IconAlertCircle size={18} />}
              >
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              color="dark"
              loading={submitting}
              fullWidth
            >
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </main>
  )
}
