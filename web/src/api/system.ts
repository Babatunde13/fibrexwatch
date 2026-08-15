import { get, post } from './client'
import type { RouterCapabilities, SystemStatus } from '../types'

export const getSystemStatus = () => get<SystemStatus>('/api/v1/status')
export const getRouterCapabilities = () => get<RouterCapabilities>('/api/v1/router')
export const runCollection = () =>
  post<{ requestId: number; status: string }>('/api/v1/collector/run')
