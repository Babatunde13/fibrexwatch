import { get, patch, post, remove } from './client'
import type { Device, DeviceDetail, DeviceHistory, DeviceSort, SortDirection } from '../types'

export const getDevices = (
  includeArchived = false,
  sort: DeviceSort = 'name',
  direction: SortDirection = 'asc',
) =>
  get<{ devices: Device[] }>(
    `/api/v1/devices?includeArchived=${includeArchived}&sort=${sort}&direction=${direction}`,
  )
export const updateDevice = (
  id: number,
  metadata: Pick<Device, 'displayName' | 'ownerName' | 'category'>,
) =>
  patch<Pick<Device, 'id' | 'displayName' | 'ownerName' | 'category'>>(
    `/api/v1/devices/${id}`,
    metadata,
  )
export const getDevice = (id: number) => get<DeviceDetail>(`/api/v1/devices/${id}`)

export const getDeviceHistory = (id: number, from: string, to: string) =>
  get<DeviceHistory>(
    `/api/v1/devices/${id}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )

export const archiveDevice = (id: number) =>
  remove<{ id: number; status: string }>(`/api/v1/devices/${id}`)

export const restoreDevice = (id: number) =>
  post<{ id: number; status: string }>(`/api/v1/devices/${id}/restore`)

export const deleteDevice = (id: number) =>
  remove<{ id: number; status: string }>(`/api/v1/devices/${id}/permanent`)

export const blockDevice = (id: number) =>
  post<{ requestId: number; status: string }>(`/api/v1/devices/${id}/block`)
