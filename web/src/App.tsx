import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Menu,
  NumberInput,
  RingProgress,
  SegmentedControl,
  Skeleton,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconActivityHeartbeat,
  IconCloudOff,
  IconCalendarStats,
  IconChartDonut,
  IconDeviceDesktopAnalytics,
  IconDevices,
  IconDownload,
  IconGauge,
  IconFileTypeCsv,
  IconJson,
  IconBulb,
  IconLogout,
  IconMoon,
  IconRefresh,
  IconSparkles,
  IconSettings,
  IconSun,
  IconTrendingDown,
  IconTrendingUp,
  IconUpload,
  IconWifi,
} from '@tabler/icons-react'
import {
  archiveDevice,
  blockDevice,
  deleteDevice,
  getDailyUsage,
  getCollectorEvents,
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
  CollectorEvent,
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
import type { DeviceDialogState } from './components/DeviceDialog'
import type { AlertStatus } from './components/DeviceListPanel'
import type { DeviceLifecycleAction } from './components/DeviceLifecycleDialog'
import { Metric } from './components/Metric'

const UsageBars = lazy(() =>
  import('./components/UsageBars').then((module) => ({ default: module.UsageBars })),
)
const UsageHeatmap = lazy(() =>
  import('./components/UsageHeatmap').then((module) => ({ default: module.UsageHeatmap })),
)
const DeviceListPanel = lazy(() =>
  import('./components/DeviceListPanel').then((module) => ({ default: module.DeviceListPanel })),
)
const NetworkHealthPage = lazy(() =>
  import('./components/NetworkHealthPage').then((module) => ({
    default: module.NetworkHealthPage,
  })),
)
const InsightsPage = lazy(() =>
  import('./components/InsightsPage').then((module) => ({ default: module.InsightsPage })),
)
const DeviceDialog = lazy(() =>
  import('./components/DeviceDialog').then((module) => ({ default: module.DeviceDialog })),
)
const EditDeviceDialog = lazy(() =>
  import('./components/EditDeviceDialog').then((module) => ({ default: module.EditDeviceDialog })),
)
const DeviceLifecycleDialog = lazy(() =>
  import('./components/DeviceLifecycleDialog').then((module) => ({
    default: module.DeviceLifecycleDialog,
  })),
)

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

type PageRoute = 'overview' | 'analytics' | 'devices' | 'insights' | 'health' | 'settings'

const pageRoutes: Array<{
  page: PageRoute
  path: string
  label: string
  icon: typeof IconGauge
  title: string
  description: string
}> = [
  {
    page: 'overview',
    path: '/',
    label: 'Overview',
    icon: IconGauge,
    title: 'Network overview',
    description: 'Your fibre usage, devices, and router health at a glance.',
  },
  {
    page: 'analytics',
    path: '/analytics',
    label: 'Analytics',
    icon: IconChartDonut,
    title: 'Usage analytics',
    description: 'Explore usage patterns, compare periods, and export your history.',
  },
  {
    page: 'devices',
    path: '/devices',
    label: 'Devices',
    icon: IconDevices,
    title: 'Connected devices',
    description: 'Identify, organise, and review devices seen on your network.',
  },
  {
    page: 'insights',
    path: '/insights',
    label: 'Insights',
    icon: IconBulb,
    title: 'Usage insights',
    description: 'See meaningful changes, forecasts, and network findings in plain language.',
  },
  {
    page: 'health',
    path: '/network-health',
    label: 'Network health',
    icon: IconActivityHeartbeat,
    title: 'Network health',
    description: 'Monitor collection freshness, router reachability, and service status.',
  },
  {
    page: 'settings',
    path: '/settings',
    label: 'Settings',
    icon: IconSettings,
    title: 'Settings',
    description: 'Configure your data plan and local dashboard preferences.',
  },
]

function routeFromPath(pathname: string): PageRoute {
  return pageRoutes.find((route) => route.path === pathname)?.page ?? 'overview'
}

export function App({ onLogout }: { onLogout: () => Promise<void> }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
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
  const [collectorEvents, setCollectorEvents] = useState<CollectorEvent[]>([])
  const [newDeviceCount, setNewDeviceCount] = useState(0)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(() => navigator.onLine)
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
  const [page, setPage] = useState<PageRoute>(() => routeFromPath(window.location.pathname))
  const pageMeta = pageRoutes.find((route) => route.page === page) ?? pageRoutes[0]

  useEffect(() => {
    const handlePopState = () => setPage(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    document.title = `${pageMeta.title} · FibreX`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pageMeta.title])

  const navigate = (nextPage: PageRoute, path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setPage(nextPage)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme
    document.documentElement.style.colorScheme = colorScheme
    localStorage.setItem('fibrex-theme', colorScheme)
  }, [colorScheme])

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
      getCollectorEvents(),
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
          collectorEventResult,
        ]) => {
          setDevices(deviceResult.devices)
          setNewDeviceCount(
            recentDeviceCount(deviceResult.devices.filter((device) => !device.archivedAt)),
          )
          setDataPlan(plan)
          setPlanUsage(planState)
          setSeries(usageSeries)
          setCapabilities(routerCapabilities)
          setCollectorEvents(collectorEventResult.events)
          setAllowanceGB(plan.allowanceBytes ? (plan.allowanceBytes / 1024 ** 3).toString() : '')
          setBillingDay(plan.billingDay.toString())
          setState({ kind: 'ready', usage, month, history, status })
          setLastUpdatedAt(new Date())
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
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
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
        getCollectorEvents(),
      ])
        .then(([usage, month, status, deviceResult, planState, collectorEventResult]) => {
          setDevices(deviceResult.devices)
          setNewDeviceCount(
            recentDeviceCount(deviceResult.devices.filter((device) => !device.archivedAt)),
          )
          setPlanUsage(planState)
          setCollectorEvents(collectorEventResult.events)
          setState((current) =>
            current.kind === 'ready' ? { ...current, usage, month, status } : current,
          )
          setLastUpdatedAt(new Date())
          setRefreshError('')
        })
        .catch((error: unknown) =>
          setRefreshError(error instanceof Error ? error.message : 'Automatic refresh failed'),
        )
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
      notifications.show({
        title: 'Collection requested',
        message: 'The worker is fetching a fresh router snapshot.',
        color: 'mtn',
      })
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
    } catch (error) {
      notifications.show({
        title: 'Collection failed',
        message: error instanceof Error ? error.message : 'Could not reach the collection worker.',
        color: 'red',
      })
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

  const stale = lastUpdatedAt !== null && now - lastUpdatedAt.getTime() > 90_000

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">
            <IconWifi size={24} />
          </span>
          <div>
            <strong>FibreX</strong>
            <small>Network console</small>
          </div>
        </div>
        <nav
          className="sidebar-nav"
          aria-label="Dashboard sections"
        >
          {pageRoutes.map((route) => {
            const NavIcon = route.icon
            return (
              <a
                key={route.page}
                href={route.path}
                className={page === route.page ? 'active' : undefined}
                aria-current={page === route.page ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(route.page, route.path)
                }}
              >
                <NavIcon size={19} /> {route.label}
              </a>
            )
          })}
        </nav>
        <div className="sidebar-status">
          <span
            className={`status-dot ${state.kind === 'ready' && state.status.collectorState === 'running' ? 'online' : ''}`}
          />
          <div>
            <strong>
              {state.kind === 'ready'
                ? state.status.collectorState.replaceAll('-', ' ')
                : 'Connecting'}
            </strong>
            <small>Collector status</small>
          </div>
        </div>
      </aside>
      <main
        className="dashboard-main"
        id="main-content"
      >
        <header className="topbar">
          <div>
            <p className="eyebrow">Local network analytics</p>
            <h1>{pageMeta.title}</h1>
            <p className="page-subtitle">
              {pageMeta.description}
              {lastUpdatedAt && (
                <span className="last-updated"> Updated {relativeTime(lastUpdatedAt, now)}</span>
              )}
            </p>
          </div>
          <Group
            gap="xs"
            className="topbar-actions"
          >
            <Badge
              variant="light"
              color="teal"
              leftSection={<IconWifi size={12} />}
            >
              Local network
            </Badge>
            <Tooltip label={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} theme`}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} theme`}
                onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
              >
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Button
              variant="default"
              leftSection={<IconLogout size={16} />}
              onClick={() => void onLogout()}
            >
              Sign out
            </Button>
          </Group>
        </header>

        {state.kind === 'loading' && (
          <section
            className="loading-grid"
            aria-label="Loading dashboard"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton
                key={index}
                height={148}
                radius="lg"
              />
            ))}
          </section>
        )}

        {state.kind === 'error' && (
          <Alert
            className="dashboard-alert"
            color="red"
            title="Something went wrong"
            icon={<IconAlertTriangle size={20} />}
          >
            {state.message}. Verify that the local API is running and accessible.
          </Alert>
        )}

        {!online && (
          <Alert
            className="dashboard-alert"
            color="red"
            title="You are offline"
            icon={<IconCloudOff size={20} />}
          >
            Live updates are paused. The dashboard will reconnect automatically when the network
            returns.
          </Alert>
        )}

        {online && state.kind === 'ready' && (stale || refreshError) && (
          <Alert
            className="dashboard-alert"
            color="orange"
            title={stale ? 'Dashboard data may be stale' : 'Live refresh failed'}
            icon={<IconAlertTriangle size={20} />}
            withCloseButton
            onClose={() => setRefreshError('')}
          >
            <Group
              justify="space-between"
              align="center"
            >
              <Text size="sm">
                {refreshError || 'No successful refresh has completed in the last 90 seconds.'}
              </Text>
              <Button
                size="xs"
                variant="light"
                color="orange"
                onClick={() => window.location.reload()}
              >
                Retry now
              </Button>
            </Group>
          </Alert>
        )}

        {state.kind === 'ready' && (
          <>
            {!state.usage.available && (
              <Alert
                className="dashboard-alert"
                color="yellow"
                title="Router collection is not active yet"
                icon={<IconAlertTriangle size={20} />}
              >
                {state.usage.unavailableReason}
              </Alert>
            )}

            {page === 'overview' &&
              planUsage?.configured &&
              planUsage.alertThresholds.some(
                (threshold) => planUsage.usedPercentage >= threshold,
              ) && (
                <Alert
                  className="dashboard-alert"
                  color="orange"
                  title="Data-plan threshold reached"
                  icon={<IconAlertTriangle size={20} />}
                >
                  You have used {planUsage.usedPercentage.toFixed(1)}% of this billing cycle’s
                  allowance.
                </Alert>
              )}

            <section
              className="metrics"
              aria-label="Today's usage"
              hidden={page !== 'overview'}
            >
              <Metric
                label="Used today"
                value={formatBytes(state.usage.totalBytes)}
                icon={<IconGauge size={20} />}
                featured
              />
              <Metric
                label={`Used in ${state.month.period}`}
                value={formatBytes(state.month.totalBytes)}
                icon={<IconCalendarStats size={20} />}
              />
              <Metric
                label="Downloaded"
                value={formatBytes(state.usage.downloadBytes)}
                icon={<IconDownload size={20} />}
              />
              <Metric
                label="Uploaded"
                value={formatBytes(state.usage.uploadBytes)}
                icon={<IconUpload size={20} />}
              />
              <Metric
                label="Online devices"
                value={state.usage.activeDevices?.toString() ?? 'Unavailable'}
                icon={<IconDeviceDesktopAnalytics size={20} />}
              />
              <Metric
                label="New in 24 hours"
                value={newDeviceCount.toString()}
                icon={<IconSparkles size={20} />}
              />
            </section>

            {planUsage?.configured && (
              <section
                className="plan-overview-card"
                hidden={page !== 'overview'}
              >
                <div className="plan-ring">
                  <RingProgress
                    size={112}
                    thickness={10}
                    roundCaps
                    sections={[{ value: Math.min(planUsage.usedPercentage, 100), color: 'mtn.5' }]}
                    label={
                      <Text
                        ta="center"
                        fw={800}
                        size="lg"
                      >
                        {planUsage.usedPercentage.toFixed(0)}%
                      </Text>
                    }
                  />
                  <div>
                    <span>Current allowance</span>
                    <strong>{formatBytes(planUsage.allowanceBytes)}</strong>
                    <small>{planUsage.remainingDays} days left in this cycle</small>
                  </div>
                </div>
                <div className="plan-quick-stats">
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
                </div>
              </section>
            )}
            {page === 'overview' && planUsage?.projectedExhaustionDate && (
              <Alert
                className="dashboard-alert"
                color="orange"
                title="Allowance may run out early"
                icon={<IconAlertTriangle size={20} />}
              >
                At the current rate, the plan is projected to finish around{' '}
                {planUsage.projectedExhaustionDate}.
              </Alert>
            )}

            {page === 'health' && (
              <Suspense fallback={<RouteSkeleton />}>
                <NetworkHealthPage
                  status={state.status}
                  events={collectorEvents}
                  now={now}
                />
              </Suspense>
            )}

            {page === 'insights' && (
              <Suspense fallback={<RouteSkeleton />}>
                <InsightsPage
                  usage={state.usage}
                  series={series}
                  plan={planUsage}
                  devices={devices}
                  status={state.status}
                  newDeviceCount={newDeviceCount}
                />
              </Suspense>
            )}

            <section
              className="grid single-panel"
              hidden={!['overview', 'analytics', 'health'].includes(page)}
            >
              {page === 'analytics' && (
                <article className="panel usage-history">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">History</p>
                      <h2>Daily usage</h2>
                    </div>
                    <TextInput
                      className="month-picker"
                      label="Month"
                      type="month"
                      value={monthFilter}
                      onChange={(event) => selectMonth(event.target.value)}
                    />
                  </div>
                  <form
                    className="date-filter"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void loadHistory(from, to)
                    }}
                  >
                    <TextInput
                      label="From"
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                    <TextInput
                      label="To"
                      type="date"
                      value={to}
                      min={from}
                      onChange={(event) => setTo(event.target.value)}
                    />
                    <Button
                      color="dark"
                      type="submit"
                      loading={historyLoading}
                    >
                      Apply range
                    </Button>
                  </form>
                  {historyError && <p className="history-error">{historyError}</p>}
                  <div className="history-total">
                    <span>
                      {state.history.from} – {state.history.to}
                    </span>
                    <strong>{formatBytes(state.history.totalBytes)}</strong>
                  </div>
                  <div className="history-tools">
                    <SegmentedControl
                      className="granularity-control"
                      value={granularity}
                      data={[
                        { value: 'hour', label: 'Hour' },
                        { value: 'day', label: 'Day' },
                        { value: 'week', label: 'Week' },
                        { value: 'month', label: 'Month' },
                      ]}
                      onChange={(value) => void changeGranularity(value)}
                    />
                    <Menu
                      shadow="md"
                      position="bottom-end"
                    >
                      <Menu.Target>
                        <Button
                          variant="default"
                          leftSection={<IconDownload size={16} />}
                        >
                          Export
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>Download usage data</Menu.Label>
                        <Menu.Item
                          component="a"
                          href={usageCSVURL(from, to, granularity)}
                          leftSection={<IconFileTypeCsv size={17} />}
                        >
                          CSV spreadsheet
                        </Menu.Item>
                        <Menu.Item
                          component="a"
                          href={usageJSONURL(from, to, granularity)}
                          leftSection={<IconJson size={17} />}
                        >
                          JSON data
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                  {series && <UsageInsights series={series} />}
                  {!!series?.points.length && (
                    <Suspense fallback={<ChartSkeleton />}>
                      {granularity === 'hour' ? (
                        <UsageHeatmap series={series} />
                      ) : (
                        <UsageBars series={series} />
                      )}
                    </Suspense>
                  )}
                  {!series?.points.length && (
                    <div className="empty-chart">
                      No stored readings exist for this period. History starts when the collector
                      begins recording.
                    </div>
                  )}
                </article>
              )}

              {(page === 'overview' || page === 'health') && (
                <article className="panel status-panel">
                  <div className="collector-heading">
                    <span
                      className={`collector-icon ${state.status.collectorState === 'running' ? 'online' : ''}`}
                    >
                      <IconWifi size={22} />
                    </span>
                    <div>
                      <p className="panel-label">Collector</p>
                      <h2>System status</h2>
                    </div>
                    <Badge
                      ml="auto"
                      color={state.status.collectorState === 'running' ? 'teal' : 'orange'}
                      variant="light"
                    >
                      {state.status.collectorState.replaceAll('-', ' ')}
                    </Badge>
                  </div>
                  <dl>
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
                  <Button
                    className="collect-button"
                    color="dark"
                    leftSection={
                      collecting ? (
                        <Loader
                          size={15}
                          color="gray"
                        />
                      ) : (
                        <IconRefresh size={17} />
                      )
                    }
                    disabled={collecting || state.status.collectorState === 'worker-offline'}
                    onClick={() => void collectNow()}
                  >
                    {collecting ? 'Collecting…' : 'Collect now'}
                  </Button>
                </article>
              )}
            </section>

            {page === 'devices' && (
              <Suspense fallback={<RouteSkeleton />}>
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
              </Suspense>
            )}

            {deviceDialog && (
              <Suspense fallback={null}>
                <DeviceDialog
                  state={deviceDialog}
                  onClose={() => setDeviceDialog(null)}
                />
              </Suspense>
            )}
            {editingDevice && (
              <Suspense fallback={null}>
                <EditDeviceDialog
                  device={editingDevice}
                  onClose={() => setEditingDevice(null)}
                  onSave={saveDevice}
                />
              </Suspense>
            )}
            {deviceLifecycle && (
              <Suspense fallback={null}>
                <DeviceLifecycleDialog
                  device={deviceLifecycle.device}
                  action={deviceLifecycle.action}
                  onClose={() => setDeviceLifecycle(null)}
                  onConfirm={() =>
                    changeDeviceLifecycle(deviceLifecycle.device, deviceLifecycle.action)
                  }
                />
              </Suspense>
            )}

            <section
              className="panel plan-settings"
              hidden={page !== 'settings'}
            >
              <div>
                <p className="panel-label">MTN allowance</p>
                <h2>Data plan</h2>
                <p className="settings-help">
                  Keep projections accurate by matching your current MTN plan.
                </p>
              </div>
              <form onSubmit={(event) => void updateDataPlan(event)}>
                <NumberInput
                  label="Allowance"
                  description="Total plan size in gigabytes"
                  min={0}
                  step={10}
                  decimalScale={1}
                  suffix=" GB"
                  value={allowanceGB}
                  onChange={(value) => setAllowanceGB(value.toString())}
                  placeholder="500 GB"
                />
                <NumberInput
                  label="Billing cycle starts"
                  description="Day of each month"
                  min={1}
                  max={28}
                  value={billingDay}
                  onChange={(value) => setBillingDay(value.toString())}
                />
                <Button
                  color="dark"
                  type="submit"
                  leftSection={<IconSettings size={17} />}
                >
                  Save plan
                </Button>
              </form>
              <Divider my="lg" />
              <p className="settings-help">
                Alerts are evaluated at 50%, 75%, 90%, and 100%. Current cycle:{' '}
                {planUsage?.cycleStart ?? '—'} to {planUsage?.cycleEnd ?? '—'}.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function UsageInsights({ series }: { series: UsageSeries }) {
  const hasPoints = series.points.length > 0
  const changeLabel = series.previousTotalBytes
    ? `${series.changePercentage >= 0 ? '+' : ''}${series.changePercentage.toFixed(1)}%`
    : 'No earlier data'
  return (
    <div className="usage-insights">
      <div>
        <span>Period change</span>
        <strong className={series.changePercentage > 0 ? 'trend-up' : 'trend-down'}>
          {series.changePercentage > 0 ? (
            <IconTrendingUp size={17} />
          ) : (
            <IconTrendingDown size={17} />
          )}
          {changeLabel}
        </strong>
      </div>
      <div>
        <span>Daily average</span>
        <strong>{hasPoints ? formatBytes(series.totalBytes / series.points.length) : '—'}</strong>
      </div>
      <div>
        <span>Peak usage</span>
        <strong>
          {hasPoints
            ? formatBytes(Math.max(...series.points.map((point) => point.totalBytes)))
            : '—'}
        </strong>
      </div>
    </div>
  )
}

function RouteSkeleton() {
  return (
    <section
      className="loading-grid"
      aria-label="Loading page"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton
          key={index}
          height={150}
          radius="lg"
        />
      ))}
    </section>
  )
}

function ChartSkeleton() {
  return (
    <div
      className="chart-loading"
      role="status"
      aria-live="polite"
    >
      <Skeleton
        height={250}
        radius="md"
      />
      <span className="sr-only">Loading usage chart</span>
    </div>
  )
}

function relativeTime(value: Date, now: number) {
  const seconds = Math.max(0, Math.round((now - value.getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}
