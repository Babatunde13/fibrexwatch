export const apiBase = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method)) {
    const csrfToken = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('fibrexwatch_csrf='))
      ?.split('=')[1]
    if (csrfToken) headers.set('X-CSRF-Token', decodeURIComponent(csrfToken))
  }
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 401) window.dispatchEvent(new Event('fibrexwatch-auth-required'))
  if (!response.ok) throw new Error(`API request failed (${response.status})`)
  return response.json() as Promise<T>
}

export const get = <T>(path: string) => request<T>(path)

export const post = <T>(path: string) => request<T>(path, { method: 'POST' })

export const postJSON = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const remove = <T>(path: string) => request<T>(path, { method: 'DELETE' })

export const patch = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
