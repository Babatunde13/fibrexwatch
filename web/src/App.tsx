import { useEffect, useState, type FormEvent } from 'react'
import {
  archiveDevice,
  blockDevice,
  deleteDevice,
  getDailyUsage,
  getDevice,
  getDeviceHistory,
  getDevices,
  getDataPlan,
  getMonthUsage,
  getPlanUsage,
  getRouterCapabilities,
  getSystemStatus,
  getTodayUsage,
  getUsageSeries,
  runCollection,
  restoreDevice,
  saveDataPlan,
  updateDevice,
  usageCSVURL,
  usageJSONURL,
} from './api'
import type {
  DataPlan,
  Device,
  PlanUsage,
  RouterCapabilities,
  SystemStatus,
  UsageHistory,
  UsageSeries,
  UsageSummary,
} from './types'
import { currentMonth, initialMonthRange, monthRange } from './utils/dates'
import { recentDeviceCount } from './utils/devices'
import { formatBytes } from './utils/format'
import { DeviceDialog, type DeviceDialogState } from './components/DeviceDialog'
import { DeviceListPanel, type AlertStatus } from './components/DeviceListPanel'
import { EditDeviceDialog } from './components/EditDeviceDialog'
import {
  DeviceLifecycleDialog,
  type DeviceLifecycleAction,
} from './components/DeviceLifecycleDialog'
import { Metric } from './components/Metric'
import { UsageBars } from './components/UsageBars'
import { UsageHeatmap } from './components/UsageHeatmap'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      usage: UsageSummary
      month: UsageSummary
      history: UsageHistory
      status: SystemStatus
    }

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  const saved = localStorage.getItem('fibrex-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function App({ onLogout }: { onLogout: () => Promise<void> }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [monthFilter, setMonthFilter] = useState(currentMonth)
  const [from, setFrom] = useState(initialMonthRange.from)
  const [to, setTo] = useState(initialMonthRange.to)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [collecting, setCollecting] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [deviceSearch, setDeviceSearch] = useState('')
  const [dataPlan, setDataPlan] = useState<DataPlan | null>(null)
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
  const [allowanceGB, setAllowanceGB] = useState('')
  const [billingDay, setBillingDay] = useState('1')
  const [granularity, setGranularity] = useState<UsageSeries['granularity']>('day')
  const [series, setSeries] = useState<UsageSeries | null>(null)
  const [capabilities, setCapabilities] = useState<RouterCapabilities | null>(null)
  const [newDeviceCount, setNewDeviceCount] = useState(0)
  const [deviceDialog, setDeviceDialog] = useState<DeviceDialogState | null>(null)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [deviceLifecycle, setDeviceLifecycle] = useState<{
    device: Device
    action: DeviceLifecycleAction
  } | null>(null)
  const [alertStatus, setAlertStatus] = useState<AlertStatus>(() => {
    if (typeof Notification === 'undefined') return 'unsupported'
    return Notification.permission
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('fibrex-theme', theme)
  }, [theme])

  useEffect(() => {
    Promise.all([
      getTodayUsage(),
      getMonthUsage(),
      getDailyUsage(initialMonthRange.from, initialMonthRange.to),
      getSystemStatus(),
      getDevices(true),
      getDataPlan(),
      getPlanUsage(),
      getUsageSeries(initialMonthRange.from, initialMonthRange.to, 'day'),
      getRouterCapabilities(),
    ])
      .then(
        ([
          usage,
          month,
          history,
          status,
          deviceResult,
          plan,
          planState,
          usageSeries,
          routerCapabilities,
        ]) => {
          setDevices(deviceResult.devices)
          setNewDeviceCount(
            recentDeviceCount(deviceResult.devices.filter((device) => !device.archivedAt)),
          )
          setDataPlan(plan)
          setPlanUsage(planState)
          setSeries(usageSeries)
          setCapabilities(routerCapabilities)
          setAllowanceGB(plan.allowanceBytes ? (plan.allowanceBytes / 1024 ** 3).toString() : '')
          setBillingDay(plan.billingDay.toString())
          setState({ kind: 'ready', usage, month, history, status })
        },
      )
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      )
  }, [])

  useEffect(() => {
    if (!devices.length || typeof Notification === 'undefined') return
    const storageKey = 'fibrex-known-devices'
    const known = new Set<number>(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as number[])
    const activeDevices = devices.filter((device) => !device.archivedAt)
    const newlySeen = activeDevices.filter((device) => !known.has(device.id))
    if (known.size && newlySeen.length && Notification.permission === 'granted') {
      new Notification('New device on FibreXWatch', {
        body: newlySeen
          .map((device) => device.displayName || device.hostname || device.macAddress)
          .join(', '),
      })
    }
    localStorage.setItem(storageKey, JSON.stringify(activeDevices.map((device) => device.id)))
  }, [devices])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void Promise.all([
        getTodayUsage(),
        getMonthUsage(),
        getSystemStatus(),
        getDevices(true),
        getPlanUsage(),
      ])
        .then(([usage, month, status, deviceResult, planState]) => {
          setDevices(deviceResult.devices)
          setNewDeviceCount(
            recentDeviceCount(deviceResult.devices.filter((device) => !device.archivedAt)),
          )
          setPlanUsage(planState)
          setState((current) =>
            current.kind === 'ready' ? { ...current, usage, month, status } : current,
          )
        })
        .catch(() => undefined)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const loadHistory = async (rangeFrom: string, rangeTo: string, month?: string) => {
    if (state.kind !== 'ready') return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const [history, selectedMonth, usageSeries] = await Promise.all([
        getDailyUsage(rangeFrom, rangeTo),
        month ? getMonthUsage(month) : Promise.resolve(state.month),
        getUsageSeries(rangeFrom, rangeTo, granularity),
      ])
      setSeries(usageSeries)
      setState({ ...state, history, month: selectedMonth })
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not load usage history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const selectMonth = (month: string) => {
    setMonthFilter(month)
    const range = monthRange(month)
    setFrom(range.from)
    setTo(range.to)
    void loadHistory(range.from, range.to, month)
  }

  const collectNow = async () => {
    if (state.kind !== 'ready') return
    setCollecting(true)
    try {
      await runCollection()
      window.setTimeout(async () => {
        try {
          const [usage, month, history, status] = await Promise.all([
            getTodayUsage(),
            getMonthUsage(state.month.period),
            getDailyUsage(state.history.from, state.history.to),
            getSystemStatus(),
          ])
          setState({ kind: 'ready', usage, month, history, status })
        } finally {
          setCollecting(false)
        }
      }, 2500)
    } catch {
      setCollecting(false)
    }
  }

  const saveDevice = async (metadata: Pick<Device, 'displayName' | 'ownerName' | 'category'>) => {
    if (!editingDevice) return
    await updateDevice(editingDevice.id, metadata)
    setDevices((current) =>
      current.map((item) => (item.id === editingDevice.id ? { ...item, ...metadata } : item)),
    )
  }

  const changeDeviceLifecycle = async (device: Device, action: DeviceLifecycleAction) => {
    if (action === 'archive') await archiveDevice(device.id)
    else if (action === 'restore') await restoreDevice(device.id)
    else if (action === 'block') await blockDevice(device.id)
    else await deleteDevice(device.id)

    const result = await getDevices(true)
    setDevices(result.devices)
    setNewDeviceCount(recentDeviceCount(result.devices.filter((item) => !item.archivedAt)))
  }

  const updateDataPlan = async (event: FormEvent) => {
    event.preventDefault()
    const plan = await saveDataPlan({
      allowanceBytes: Math.round(Number(allowanceGB) * 1024 ** 3),
      billingDay: Number(billingDay),
      alertThresholds: dataPlan?.alertThresholds ?? [50, 75, 90, 100],
    })
    setDataPlan(plan)
    setPlanUsage(await getPlanUsage())
  }

  const changeGranularity = async (value: UsageSeries['granularity']) => {
    setGranularity(value)
    setSeries(await getUsageSeries(from, to, value))
  }

  const showDevice = async (device: Device) => {
    const name = device.displayName || device.hostname || device.macAddress
    setDeviceDialog({ kind: 'loading', name })
    try {
      const [detail, history] = await Promise.all([
        getDevice(device.id),
        getDeviceHistory(device.id, initialMonthRange.from, initialMonthRange.to),
      ])
      setDeviceDialog({ kind: 'ready', detail, history })
    } catch (error) {
      setDeviceDialog({
        kind: 'error',
        name,
        message: error instanceof Error ? error.message : 'Could not load device history',
      })
    }
  }

  const enableDeviceAlerts = async () => {
    if (typeof Notification === 'undefined') {
      setAlertStatus('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setAlertStatus(permission)
    if (permission === 'granted') {
      new Notification('FibreXWatch alerts enabled', {
        body: 'You will be notified when the dashboard detects a new device.',
      })
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Local network analytics</p>
          <h1>FibreXWatch</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => void onLogout()}
          >
            Sign out
          </button>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <span className="local-badge">Localhost</span>
        </div>
      </header>

      {state.kind === 'loading' && (
        <section className="notice">Connecting to the local API…</section>
      )}

      {state.kind === 'error' && (
        <section className="notice error">
          <strong>Something went wrong.</strong>
          <span>Verify that the local API is running and accessible.</span>
        </section>
      )}

      {state.kind === 'ready' && (
        <>
          {!state.usage.available && (
            <section className="notice warning">
              <strong>Router collection is not active yet.</strong>
              <span>{state.usage.unavailableReason}</span>
            </section>
          )}

          {planUsage?.configured &&
            planUsage.alertThresholds.some(
              (threshold) => planUsage.usedPercentage >= threshold,
            ) && (
              <section className="notice warning">
                <strong>Data-plan threshold reached.</strong>
                <span>
                  You have used {planUsage.usedPercentage.toFixed(1)}% of this billing cycle’s
                  allowance.
                </span>
              </section>
            )}

          <section
            className="metrics"
            aria-label="Today's usage"
          >
            <Metric
              label="Used today"
              value={formatBytes(state.usage.totalBytes)}
              featured
            />
            <Metric
              label={`Used in ${state.month.period}`}
              value={formatBytes(state.month.totalBytes)}
            />
            <Metric
              label="Downloaded"
              value={formatBytes(state.usage.downloadBytes)}
            />
            <Metric
              label="Uploaded"
              value={formatBytes(state.usage.uploadBytes)}
            />
            <Metric
              label="Online devices"
              value={state.usage.activeDevices?.toString() ?? 'Unavailable'}
            />
            <Metric
              label="New in 24 hours"
              value={newDeviceCount.toString()}
            />
          </section>

          {planUsage?.configured && (
            <section className="plan-strip">
              <div>
                <span>Plan used</span>
                <strong>{planUsage.usedPercentage.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{formatBytes(planUsage.remainingBytes)}</strong>
              </div>
              <div>
                <span>Daily budget</span>
                <strong>{formatBytes(planUsage.dailyBudgetBytes)}</strong>
              </div>
              <div>
                <span>Projected</span>
                <strong>{formatBytes(planUsage.projectedBytes)}</strong>
              </div>
              <div className="plan-progress">
                <span style={{ width: `${Math.min(planUsage.usedPercentage, 100)}%` }} />
              </div>
            </section>
          )}
          {planUsage?.projectedExhaustionDate && (
            <section className="notice warning">
              <strong>Allowance may run out early.</strong>
              <span>
                At the current rate, the plan is projected to finish around{' '}
                {planUsage.projectedExhaustionDate}.
              </span>
            </section>
          )}

          <section className="grid">
            <article className="panel usage-history">
              <div className="panel-heading">
                <div>
                  <p className="panel-label">History</p>
                  <h2>Daily usage</h2>
                </div>
                <label>
                  Month
                  <input
                    type="month"
                    value={monthFilter}
                    onChange={(event) => selectMonth(event.target.value)}
                  />
                </label>
              </div>
              <form
                className="date-filter"
                onSubmit={(event) => {
                  event.preventDefault()
                  void loadHistory(from, to)
                }}
              >
                <label>
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={to}
                    min={from}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={historyLoading}
                >
                  {historyLoading ? 'Loading…' : 'Apply range'}
                </button>
              </form>
              {historyError && <p className="history-error">{historyError}</p>}
              <div className="history-total">
                <span>
                  {state.history.from} – {state.history.to}
                </span>
                <strong>{formatBytes(state.history.totalBytes)}</strong>
              </div>
              <div className="history-tools">
                <select
                  value={granularity}
                  onChange={(event) =>
                    void changeGranularity(event.target.value as UsageSeries['granularity'])
                  }
                >
                  <option value="hour">Hourly</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
                <a href={usageCSVURL(from, to, granularity)}>Export CSV</a>
                <a href={usageJSONURL(from, to, granularity)}>Export JSON</a>
              </div>
              {series && (
                <p className="comparison">
                  Compared with previous period:{' '}
                  <strong>
                    {series.previousTotalBytes
                      ? `${series.changePercentage >= 0 ? '+' : ''}${series.changePercentage.toFixed(1)}%`
                      : 'No earlier data'}
                  </strong>
                </p>
              )}
              {series?.points.length ? (
                <p className="comparison">
                  Average: <strong>{formatBytes(series.totalBytes / series.points.length)}</strong>{' '}
                  · Peak:{' '}
                  <strong>
                    {formatBytes(Math.max(...series.points.map((point) => point.totalBytes)))}
                  </strong>
                </p>
              ) : null}
              {!!series?.points.length &&
                (granularity === 'hour' ? (
                  <UsageHeatmap series={series} />
                ) : (
                  <UsageBars series={series} />
                ))}
              {!series?.points.length && (
                <div className="empty-chart">
                  No stored readings exist for this period. History starts when the collector begins
                  recording.
                </div>
              )}
            </article>

            <article className="panel status-panel">
              <p className="panel-label">Collector</p>
              <h2>System status</h2>
              <dl>
                <div>
                  <dt>State</dt>
                  <dd>{state.status.collectorState}</dd>
                </div>
                <div>
                  <dt>Adapter</dt>
                  <dd>{state.status.routerAdapter}</dd>
                </div>
                <div>
                  <dt>Router</dt>
                  <dd>{state.status.routerAddress || 'Not configured'}</dd>
                </div>
                <div>
                  <dt>Interval</dt>
                  <dd>{state.status.collectionIntervalSeconds}s</dd>
                </div>
                <div>
                  <dt>Last reading</dt>
                  <dd>
                    {state.status.lastCollectedAt
                      ? new Date(state.status.lastCollectedAt).toLocaleTimeString()
                      : 'None'}
                  </dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{state.status.timezone}</dd>
                </div>
              </dl>
              <button
                className="collect-button"
                type="button"
                disabled={collecting || state.status.collectorState === 'worker-offline'}
                onClick={() => void collectNow()}
              >
                {collecting ? 'Collecting…' : 'Collect now'}
              </button>
            </article>
          </section>

          <DeviceListPanel
            devices={devices}
            search={deviceSearch}
            alertStatus={alertStatus}
            capabilities={capabilities}
            onSearch={setDeviceSearch}
            onEnableAlerts={() => void enableDeviceAlerts()}
            onHistory={(device) => void showDevice(device)}
            onEdit={setEditingDevice}
            onArchive={(device) => setDeviceLifecycle({ device, action: 'archive' })}
            onRestore={(device) => setDeviceLifecycle({ device, action: 'restore' })}
            onDelete={(device) => setDeviceLifecycle({ device, action: 'delete' })}
            onBlock={(device) => setDeviceLifecycle({ device, action: 'block' })}
          />

          {deviceDialog && (
            <DeviceDialog
              state={deviceDialog}
              onClose={() => setDeviceDialog(null)}
            />
          )}
          {editingDevice && (
            <EditDeviceDialog
              device={editingDevice}
              onClose={() => setEditingDevice(null)}
              onSave={saveDevice}
            />
          )}
          {deviceLifecycle && (
            <DeviceLifecycleDialog
              device={deviceLifecycle.device}
              action={deviceLifecycle.action}
              onClose={() => setDeviceLifecycle(null)}
              onConfirm={() =>
                changeDeviceLifecycle(deviceLifecycle.device, deviceLifecycle.action)
              }
            />
          )}

          <section className="panel plan-settings">
            <div>
              <p className="panel-label">MTN allowance</p>
              <h2>Data plan</h2>
            </div>
            <form onSubmit={(event) => void updateDataPlan(event)}>
              <label>
                Allowance (GB)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={allowanceGB}
                  onChange={(event) => setAllowanceGB(event.target.value)}
                  placeholder="e.g. 500"
                />
              </label>
              <label>
                Billing cycle starts
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={billingDay}
                  onChange={(event) => setBillingDay(event.target.value)}
                />
              </label>
              <button type="submit">Save plan</button>
            </form>
            <p className="settings-help">
              Alerts are evaluated at 50%, 75%, 90%, and 100%. Current cycle:{' '}
              {planUsage?.cycleStart ?? '—'} to {planUsage?.cycleEnd ?? '—'}.
            </p>
          </section>
        </>
      )}
    </main>
  )
}
