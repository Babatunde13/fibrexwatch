import { get, post, postJSON } from './client'

export type AuthSession = {
  authenticated: boolean
  authenticationEnabled: boolean
  username?: string
}

export const getAuthSession = () => get<AuthSession>('/api/v1/auth/session')
export const login = (username: string, password: string) =>
  postJSON<AuthSession>('/api/v1/auth/login', { username, password })
export const logout = () => post<{ authenticated: boolean }>('/api/v1/auth/logout')
