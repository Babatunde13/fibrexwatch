export type UsageSummary = {
  period: string
  available: boolean
  downloadBytes: number | null
  uploadBytes: number | null
  totalBytes: number | null
  activeDevices: number | null
  unavailableReason?: string
}

export type SystemStatus = {
  routerConfigured: boolean
  routerAddress: string
  routerAdapter: string
  collectorState:
    | 'not-configured'
    | 'worker-offline'
    | 'awaiting-interface'
    | 'starting'
    | 'running'
    | 'stale'
    | 'error'
  lastCollectedAt: string | null
  collectionIntervalSeconds: number
  timezone: string
}

export type DailyUsage = {
  date: string
  downloadBytes: number
  uploadBytes: number
  totalBytes: number
}
export type UsageHistory = {
  from: string
  to: string
  available: boolean
  downloadBytes: number
  uploadBytes: number
  totalBytes: number
  days: DailyUsage[]
}
export type Device = {
  id: number
  macAddress: string
  hostname: string
  displayName: string
  manufacturer: string
  ownerName: string
  category: string
  ipAddress: string
  ssidName: string
  connectionType: string
  connectionBand: '2.4 GHz' | '5 GHz' | 'Ethernet' | 'Unknown'
  firstSeenAt: string
  lastSeenAt: string
  online: boolean
  statusAt: string | null
  archivedAt: string | null
  blockedAt: string | null
  blockPending: boolean
}
export type DeviceSort =
  'name' | 'lastSeen' | 'firstSeen' | 'status' | 'ipAddress' | 'owner' | 'category' | 'ssid'
export type SortDirection = 'asc' | 'desc'
export type DataPlan = {
  allowanceBytes: number
  billingDay: number
  alertThresholds: number[]
  updatedAt: string
}
export type PlanUsage = {
  configured: boolean
  cycleStart: string
  cycleEnd: string
  allowanceBytes: number
  usedBytes: number
  remainingBytes: number
  dailyBudgetBytes: number
  projectedBytes: number
  usedPercentage: number
  remainingDays: number
  projectedExhaustionDate: string
  alertThresholds: number[]
}
export type UsageSeries = {
  from: string
  to: string
  granularity: 'hour' | 'day' | 'week' | 'month'
  totalBytes: number
  previousTotalBytes: number
  changePercentage: number
  points: Array<{
    period: string
    downloadBytes: number
    uploadBytes: number
    totalBytes: number
    readingCount: number
  }>
}
export type RouterCapabilities = {
  adapter: string
  connectionCounters: boolean
  connectedDevices: boolean
  perDeviceCounters: boolean
  deviceBlocking: boolean
  perDeviceUsageReason: string
}
export type DeviceDetail = {
  device: Device
  addresses: Array<{ ipAddress: string; firstSeenAt: string; lastSeenAt: string }>
}
export type DeviceHistory = {
  deviceId: number
  from: string
  to: string
  days: Array<{
    date: string
    firstSeenAt: string
    lastSeenAt: string
    onlineSamples: number
    totalSamples: number
    onlineSessions: number
    estimatedOnlineSeconds: number
  }>
}
