import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, NumberInput, Select, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconCalendarTime, IconPlayerStop } from '@tabler/icons-react'
import { cancelMaintenance, createMaintenance, getMaintenance } from '../api'
import type { MaintenanceState } from '../types'

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function MaintenancePanel() {
  const [state, setState] = useState<MaintenanceState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [kind, setKind] = useState<'one-off' | 'weekly'>('one-off')
  const [label, setLabel] = useState('Planned router maintenance')
  const [startsAt, setStartsAt] = useState(() => defaultOneOffRange(60).startsAt)
  const [endsAt, setEndsAt] = useState(() => defaultOneOffRange(60).endsAt)
  const [weekday, setWeekday] = useState(String(new Date().getDay()))
  const [startTime, setStartTime] = useState('02:00')
  const [duration, setDuration] = useState(60)

  const refresh = async () => {
    try {
      setState(await getMaintenance())
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load maintenance windows')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const createQuickWindow = async (minutes: number) => {
    const range = defaultOneOffRange(minutes)
    setSaving(true)
    try {
      await createMaintenance({
        kind: 'one-off',
        label: minutes >= 24 * 60 ? 'Maintenance until tomorrow' : `${minutes}-minute maintenance`,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      })
      setStartsAt(range.startsAt)
      setEndsAt(range.endsAt)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start maintenance')
    } finally {
      setSaving(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (kind === 'one-off') {
        await createMaintenance({
          kind,
          label,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        })
      } else {
        const [hours, minutes] = startTime.split(':').map(Number)
        await createMaintenance({
          kind,
          label,
          weekdays: [Number(weekday)],
          startMinute: hours * 60 + minutes,
          durationMinutes: duration,
        })
      }
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save maintenance window')
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (id: number) => {
    setSaving(true)
    try {
      await cancelMaintenance(id)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not cancel maintenance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="panel maintenance-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-label">Alert suppression</p>
          <h2>Maintenance mode</h2>
          <p>Expected outage alerts are muted while measurements and events continue recording.</p>
        </div>
        <Badge
          color={state?.active ? 'orange' : 'teal'}
          variant="light"
        >
          {state?.active ? 'Active' : 'Normal monitoring'}
        </Badge>
      </div>
      {state?.active && (
        <Alert
          color="orange"
          title={state.active.label}
          icon={<IconCalendarTime size={18} />}
        >
          Maintenance is active. Collector incidents remain in history but live outage alerts are
          suppressed.
        </Alert>
      )}
      {error && (
        <Alert
          color="red"
          title="Maintenance update failed"
          icon={<IconAlertTriangle size={18} />}
        >
          {error}
        </Alert>
      )}
      <div className="maintenance-quick-actions">
        <span>Start now:</span>
        <Button
          variant="default"
          size="compact-sm"
          loading={saving}
          onClick={() => void createQuickWindow(30)}
        >
          30 min
        </Button>
        <Button
          variant="default"
          size="compact-sm"
          loading={saving}
          onClick={() => void createQuickWindow(60)}
        >
          1 hour
        </Button>
        <Button
          variant="default"
          size="compact-sm"
          loading={saving}
          onClick={() => void createQuickWindow(24 * 60)}
        >
          Until tomorrow
        </Button>
      </div>
      <form
        className="maintenance-form"
        onSubmit={(event) => void submit(event)}
      >
        <Select
          label="Window type"
          value={kind}
          allowDeselect={false}
          onChange={(value) => setKind((value as 'one-off' | 'weekly') || 'one-off')}
          data={[
            { value: 'one-off', label: 'One-off' },
            { value: 'weekly', label: 'Weekly' },
          ]}
        />
        <TextInput
          label="Label"
          value={label}
          maxLength={120}
          required
          onChange={(event) => setLabel(event.currentTarget.value)}
        />
        {kind === 'one-off' ? (
          <>
            <TextInput
              type="datetime-local"
              label="Starts"
              value={startsAt}
              required
              onChange={(event) => setStartsAt(event.currentTarget.value)}
            />
            <TextInput
              type="datetime-local"
              label="Ends"
              value={endsAt}
              required
              onChange={(event) => setEndsAt(event.currentTarget.value)}
            />
          </>
        ) : (
          <>
            <Select
              label="Weekday"
              value={weekday}
              allowDeselect={false}
              onChange={(value) => setWeekday(value || '0')}
              data={weekdays.map((day, index) => ({ value: String(index), label: day }))}
            />
            <TextInput
              type="time"
              label="Starts"
              value={startTime}
              required
              onChange={(event) => setStartTime(event.currentTarget.value)}
            />
            <NumberInput
              label="Duration"
              suffix=" min"
              min={15}
              max={1440}
              value={duration}
              onChange={(value) => setDuration(Number(value) || 15)}
            />
          </>
        )}
        <Button
          type="submit"
          color="dark"
          loading={saving}
        >
          Save window
        </Button>
      </form>
      <div className="maintenance-history">
        <h3>Recent windows</h3>
        {!loading && !state?.windows.length && <p>No maintenance windows have been created.</p>}
        {state?.windows.map((window) => (
          <div
            key={window.id}
            className={window.cancelledAt ? 'cancelled' : undefined}
          >
            <div>
              <strong>{window.label}</strong>
              <span>
                {describeWindow(window)} · created by {window.createdBy}
              </span>
              {window.cancelledAt && (
                <span>
                  Cancelled by {window.cancelledBy} on{' '}
                  {new Date(window.cancelledAt).toLocaleString()}
                </span>
              )}
            </div>
            {!window.cancelledAt && (
              <Button
                variant="subtle"
                color="red"
                size="compact-sm"
                leftSection={<IconPlayerStop size={14} />}
                disabled={saving}
                onClick={() => void cancel(window.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}

function defaultOneOffRange(minutes: number) {
  const start = new Date()
  const end = new Date(start.getTime() + minutes * 60_000)
  return { startsAt: localDateTime(start), endsAt: localDateTime(end) }
}

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function describeWindow(window: MaintenanceState['windows'][number]) {
  if (window.kind === 'one-off') {
    return `${new Date(window.startsAt!).toLocaleString()} – ${new Date(window.endsAt!).toLocaleString()}`
  }
  const hour = Math.floor((window.startMinute || 0) / 60)
  const minute = (window.startMinute || 0) % 60
  return `${weekdays[window.weekdays[0]]} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} for ${window.durationMinutes} min`
}
