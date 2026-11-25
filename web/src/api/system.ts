import { get, patch, post, postJSON, remove } from './client'
import type {
  CollectorEvent,
  AlertState,
  MaintenanceState,
  MaintenanceWindow,
  NotificationPreferences,
  NetworkQualityHistory,
  RouterCapabilities,
  RouterScan,
  SystemStatus,
} from '../types'

export const getSystemStatus = () => get<SystemStatus>('/api/v1/status')
export const getRouterCapabilities = () => get<RouterCapabilities>('/api/v1/router')
export const runCollection = () =>
  post<{ requestId: number; status: string }>('/api/v1/collector/run')
export const getCollectorEvents = (limit = 50) =>
  get<{ events: CollectorEvent[] }>(`/api/v1/collector/events?limit=${limit}`)
export const getNetworkQuality = (hours = 24) =>
  get<NetworkQualityHistory>(`/api/v1/network-quality?hours=${hours}`)
export const getMaintenance = () => get<MaintenanceState>('/api/v1/settings/maintenance')
export const createMaintenance = (input: {
  kind: 'one-off' | 'weekly'
  label: string
  startsAt?: string
  endsAt?: string
  weekdays?: number[]
  startMinute?: number
  durationMinutes?: number
}) => postJSON<MaintenanceWindow>('/api/v1/settings/maintenance', input)
export const cancelMaintenance = (id: number) =>
  remove<{ cancelled: boolean }>(`/api/v1/settings/maintenance/${id}`)
export const getAlertState = () => get<AlertState>('/api/v1/alerts/state')
export const setAlertsRead = (alertKeys: string[], read: boolean) =>
  patch<{ updated: number; read: boolean }>('/api/v1/alerts/read', { alertKeys, read })
export const saveNotificationPreferences = (
  preferences: Omit<NotificationPreferences, 'updatedAt'>,
) => patch<NotificationPreferences>('/api/v1/settings/notifications', preferences)
export const getRouterScan = () =>
  get<{ scan: RouterScan | null; history: RouterScan[] }>('/api/v1/router/scan?limit=10')
export const runRouterScan = () =>
  post<{ requestId: number; status: string }>('/api/v1/router/scan')
