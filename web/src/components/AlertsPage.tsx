import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, SegmentedControl, Switch } from '@mantine/core'
import {
  IconAlertTriangle,
  IconBell,
  IconCalendarStats,
  IconCheck,
  IconDeviceMobile,
  IconWifiOff,
} from '@tabler/icons-react'
import { getAlertState, saveNotificationPreferences, setAlertsRead } from '../api'
import type {
  CollectorEvent,
  Device,
  NotificationPreferences,
  PlanUsage,
  SystemStatus,
} from '../types'

type AlertSeverity = 'info' | 'warning' | 'critical' | 'resolved'
type AlertFilter = 'all' | 'unread' | AlertSeverity

type AlertItem = {
  id: string
  title: string
  message: string
  occurredAt: string
  severity: AlertSeverity
  source: 'Collector' | 'Data plan' | 'Devices'
  icon: typeof IconBell
}

export function AlertsPage({
  events,
  plan,
  devices,
  status,
  newDeviceCount,
  preferences,
  onPreferencesChange,
}: {
  events: CollectorEvent[]
  plan: PlanUsage | null
  devices: Device[]
  status: SystemStatus
  newDeviceCount: number
  preferences: NotificationPreferences
  onPreferencesChange: (preferences: NotificationPreferences) => void
}) {
  const [filter, setFilter] = useState<AlertFilter>('all')
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [stateError, setStateError] = useState('')
  const [saving, setSaving] = useState(false)
  const alerts = useMemo(
    () => buildAlerts(events, plan, devices, status, newDeviceCount),
    [devices, events, newDeviceCount, plan, status],
  )
  const unreadCount = alerts.filter((alert) => !readIds.has(alert.id)).length
  const visibleAlerts = alerts.filter((alert) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !readIds.has(alert.id)
    return alert.severity === filter
  })

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void getAlertState()
        .then((state) => {
          if (!active) return
          setReadIds(new Set(state.readIds))
          onPreferencesChange(state.preferences)
          setStateError('')
        })
        .catch((error: unknown) => {
          if (active) {
            setStateError(error instanceof Error ? error.message : 'Could not load alert state')
          }
        })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [onPreferencesChange])

  const updateReadIds = async (next: Set<string>, changed: string[], read: boolean) => {
    const previous = readIds
    setReadIds(next)
    setStateError('')
    try {
      await setAlertsRead(changed, read)
    } catch (error) {
      setReadIds(previous)
      setStateError(error instanceof Error ? error.message : 'Could not save alert state')
    }
  }

  const toggleRead = (id: string) => {
    const next = new Set(readIds)
    const read = !next.has(id)
    if (read) next.add(id)
    else next.delete(id)
    void updateReadIds(next, [id], read)
  }

  const updatePreference = async (
    key: 'collectorEnabled' | 'dataPlanEnabled' | 'deviceEnabled' | 'reportEnabled',
    enabled: boolean,
  ) => {
    const previous = preferences
    const next = { ...preferences, [key]: enabled }
    onPreferencesChange(next)
    setSaving(true)
    setStateError('')
    try {
      onPreferencesChange(
        await saveNotificationPreferences({
          collectorEnabled: next.collectorEnabled,
          dataPlanEnabled: next.dataPlanEnabled,
          deviceEnabled: next.deviceEnabled,
          reportEnabled: next.reportEnabled,
        }),
      )
    } catch (error) {
      onPreferencesChange(previous)
      setStateError(error instanceof Error ? error.message : 'Could not save preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="alerts-page">
      <div className="alerts-summary">
        <div className="alert-summary-icon">
          <IconBell size={24} />
        </div>
        <div>
          <p className="panel-label">Notification centre</p>
          <strong>
            {unreadCount
              ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`
              : 'You’re all caught up'}
          </strong>
          <span>Collector incidents and current network warnings appear here.</span>
        </div>
        <Button
          ml="auto"
          variant="default"
          size="sm"
          disabled={!unreadCount}
          leftSection={<IconCheck size={16} />}
          onClick={() => {
            const ids = alerts.map((alert) => alert.id)
            void updateReadIds(new Set([...readIds, ...ids]), ids, true)
          }}
        >
          Mark all read
        </Button>
      </div>

      {stateError && (
        <Alert
          color="red"
          title="Notification state unavailable"
          icon={<IconAlertTriangle size={18} />}
        >
          {stateError}
        </Alert>
      )}

      <div className="notification-preferences">
        <div>
          <strong>Delivery preferences</strong>
          <span>Alert history remains available when delivery is disabled.</span>
        </div>
        <Switch
          label="Collector"
          checked={preferences.collectorEnabled}
          disabled={saving}
          onChange={(event) =>
            void updatePreference('collectorEnabled', event.currentTarget.checked)
          }
        />
        <Switch
          label="Data plan"
          checked={preferences.dataPlanEnabled}
          disabled={saving}
          onChange={(event) =>
            void updatePreference('dataPlanEnabled', event.currentTarget.checked)
          }
        />
        <Switch
          label="Devices"
          checked={preferences.deviceEnabled}
          disabled={saving}
          onChange={(event) => void updatePreference('deviceEnabled', event.currentTarget.checked)}
        />
        <Switch
          label="Reports"
          checked={preferences.reportEnabled}
          disabled={saving}
          onChange={(event) => void updatePreference('reportEnabled', event.currentTarget.checked)}
        />
      </div>

      <div className="alerts-toolbar">
        <SegmentedControl
          value={filter}
          onChange={(value) => setFilter(value)}
          data={[
            { value: 'all', label: `All ${alerts.length}` },
            { value: 'unread', label: `Unread ${unreadCount}` },
            { value: 'critical', label: 'Critical' },
            { value: 'warning', label: 'Warning' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </div>

      {status.maintenance && (
        <div className="maintenance-alert-note">
          <IconCalendarStats size={18} />
          <span>
            <strong>Maintenance mode is active.</strong> Live collector outage warnings are
            suppressed; recorded events remain visible below.
          </span>
        </div>
      )}

      {visibleAlerts.length ? (
        <div className="alerts-list">
          {visibleAlerts.map((alert) => {
            const AlertIcon = alert.icon
            const isRead = readIds.has(alert.id)
            return (
              <article
                className={`alert-row ${isRead ? 'read' : 'unread'}`}
                key={alert.id}
              >
                <span className={`alert-row-icon ${alert.severity}`}>
                  <AlertIcon size={19} />
                </span>
                <div className="alert-row-content">
                  <div>
                    <strong>{alert.title}</strong>
                    <Badge
                      size="xs"
                      variant="light"
                      color={severityColor(alert.severity)}
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                  <p>{alert.message}</p>
                  <small>
                    {alert.source} · {new Date(alert.occurredAt).toLocaleString()}
                  </small>
                </div>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  color="gray"
                  onClick={() => toggleRead(alert.id)}
                >
                  {isRead ? 'Mark unread' : 'Mark read'}
                </Button>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="panel alerts-empty-state">
          <IconCheck size={30} />
          <strong>No alerts match this view</strong>
          <span>Try another filter or return after more network activity is recorded.</span>
        </div>
      )}
    </section>
  )
}

function buildAlerts(
  events: CollectorEvent[],
  plan: PlanUsage | null,
  devices: Device[],
  status: SystemStatus,
  newDeviceCount: number,
): AlertItem[] {
  const alerts: AlertItem[] = events.map((event) => ({
    id: `collector-${event.id}`,
    title: eventLabel(event.eventType),
    message: event.message || 'The collector recorded an operational event.',
    occurredAt: event.occurredAt,
    severity: eventSeverity(event.eventType),
    source: 'Collector',
    icon: event.eventType.includes('recover') ? IconCheck : IconWifiOff,
  }))

  if (status.collectorState !== 'running' && !status.maintenance) {
    alerts.push({
      id: `collector-current-${status.collectorState}`,
      title: 'Collector needs attention',
      message:
        status.worker?.lastError ||
        `Collector state is ${status.collectorState.replaceAll('-', ' ')}.`,
      occurredAt: status.worker?.lastAttemptAt || new Date().toISOString(),
      severity: 'critical',
      source: 'Collector',
      icon: IconAlertTriangle,
    })
  }

  if (plan?.configured) {
    const reachedThreshold = [...plan.alertThresholds]
      .sort((first, second) => second - first)
      .find((threshold) => plan.usedPercentage >= threshold)
    if (reachedThreshold !== undefined) {
      alerts.push({
        id: `plan-threshold-${plan.cycleStart}-${reachedThreshold}`,
        title: `${reachedThreshold}% data-plan threshold reached`,
        message: `You have used ${plan.usedPercentage.toFixed(1)}% of this billing cycle’s allowance.`,
        occurredAt: new Date().toISOString(),
        severity: reachedThreshold >= 90 ? 'critical' : 'warning',
        source: 'Data plan',
        icon: IconCalendarStats,
      })
    }
    if (plan.projectedBytes > plan.allowanceBytes) {
      alerts.push({
        id: `plan-projection-${plan.cycleStart}`,
        title: 'Allowance projected to run out early',
        message: plan.projectedExhaustionDate
          ? `At the current rate, the allowance may finish around ${plan.projectedExhaustionDate}.`
          : 'Current usage is projected to exceed the configured allowance.',
        occurredAt: new Date().toISOString(),
        severity: 'warning',
        source: 'Data plan',
        icon: IconAlertTriangle,
      })
    }
  }

  if (newDeviceCount) {
    const newest = devices
      .filter((device) => !device.archivedAt)
      .sort((first, second) => Date.parse(second.firstSeenAt) - Date.parse(first.firstSeenAt))[0]
    alerts.push({
      id: `devices-new-${newest?.firstSeenAt ?? newDeviceCount}`,
      title: `${newDeviceCount} new device${newDeviceCount === 1 ? '' : 's'} detected`,
      message: newest
        ? `${newest.displayName || newest.hostname || newest.macAddress} is among the newest devices on the network.`
        : 'Review recently discovered devices and identify anything unfamiliar.',
      occurredAt: newest?.firstSeenAt || new Date().toISOString(),
      severity: 'info',
      source: 'Devices',
      icon: IconDeviceMobile,
    })
  }

  return alerts.sort(
    (first, second) => Date.parse(second.occurredAt) - Date.parse(first.occurredAt),
  )
}

function eventLabel(eventType: string) {
  return eventType.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())
}

function eventSeverity(eventType: string): AlertSeverity {
  if (eventType.includes('recover')) return 'resolved'
  if (
    eventType.includes('fail') ||
    eventType.includes('error') ||
    eventType.includes('unreachable')
  )
    return 'critical'
  if (
    eventType.includes('interrupt') ||
    eventType.includes('gap') ||
    eventType.includes('reset') ||
    eventType.includes('latency') ||
    eventType.includes('packet_loss')
  ) {
    return 'warning'
  }
  return 'info'
}

function severityColor(severity: AlertSeverity) {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'orange'
  if (severity === 'resolved') return 'teal'
  return 'blue'
}
