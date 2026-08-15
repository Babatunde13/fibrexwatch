import type { Device } from '../types'

export const recentDeviceCount = (devices: Device[]) =>
  devices.filter((device) => {
    return new Date(device.firstSeenAt).getTime() >= Date.now() - 86_400_000
  }).length
