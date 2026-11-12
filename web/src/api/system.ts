import { get, post } from './client'
import type { CollectorEvent, RouterCapabilities, RouterScan, SystemStatus } from '../types'

export const getSystemStatus = () => get<SystemStatus>('/api/v1/status')
export const getRouterCapabilities = () => get<RouterCapabilities>('/api/v1/router')
export const runCollection = () =>
  post<{ requestId: number; status: string }>('/api/v1/collector/run')
export const getCollectorEvents = (limit = 50) =>
  get<{ events: CollectorEvent[] }>(`/api/v1/collector/events?limit=${limit}`)
export const getRouterScan = () =>
  get<{ scan: RouterScan | null; history: RouterScan[] }>('/api/v1/router/scan?limit=10')
export const runRouterScan = () =>
  post<{ requestId: number; status: string }>('/api/v1/router/scan')
