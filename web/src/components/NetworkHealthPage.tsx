import { Badge } from '@mantine/core'
import { IconWifi } from '@tabler/icons-react'
import type { CollectorEvent, SystemStatus } from '../types'

export function NetworkHealthPage({
  status,
  events,
  now,
}: {
  status: SystemStatus
  events: CollectorEvent[]
  now: number
}) {
  const lastReading = status.lastCollectedAt ? new Date(status.lastCollectedAt) : null
  const readingAge = lastReading ? Math.max(0, now - lastReading.getTime()) : null
  const expectedInterval = status.collectionIntervalSeconds * 1000
  let freshness = 'No readings yet'
  if (readingAge !== null) freshness = readingAge <= expectedInterval * 2 ? 'Fresh' : 'Delayed'
  const workerUptime = status.worker
    ? formatDuration(Math.max(0, now - new Date(status.worker.startedAt).getTime()))
    : 'Unavailable'

  return (
    <section
      className="network-health"
      aria-label="Network health summary"
    >
      <div className="health-metrics">
        <article className="health-metric">
          <span>Current state</span>
          <strong>{status.collectorState.replaceAll('-', ' ')}</strong>
          <small>{status.routerConfigured ? 'Router configured' : 'Setup required'}</small>
        </article>
        <article className="health-metric">
          <span>Reading freshness</span>
          <strong>{freshness}</strong>
          <small>
            {lastReading ? relativeTime(lastReading, now) : 'Waiting for first collection'}
          </small>
        </article>
        <article className="health-metric">
          <span>Worker uptime</span>
          <strong>{workerUptime}</strong>
          <small>
            {status.worker
              ? `Started ${new Date(status.worker.startedAt).toLocaleString()}`
              : 'No heartbeat'}
          </small>
        </article>
        <article className="health-metric">
          <span>Consecutive failures</span>
          <strong>{status.worker?.consecutiveFailures ?? '—'}</strong>
          <small>{status.worker?.lastError || 'No active collection error'}</small>
        </article>
      </div>

      <article className="panel event-timeline-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-label">Operational history</p>
            <h2>Collector events</h2>
          </div>
          <Badge
            variant="light"
            color={events.length ? 'orange' : 'teal'}
          >
            {events.length ? `${events.length} recent` : 'All clear'}
          </Badge>
        </div>
        {events.length ? (
          <ol className="event-timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className={`event-marker ${eventTone(event.eventType)}`} />
                <div>
                  <strong>{eventLabel(event.eventType)}</strong>
                  <p>{event.message || 'The collector recorded this operational event.'}</p>
                </div>
                <time dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="health-empty-state">
            <IconWifi size={28} />
            <strong>No collector incidents recorded</strong>
            <span>Failures, counter resets, and collection gaps will appear here.</span>
          </div>
        )}
      </article>
    </section>
  )
}

function eventLabel(eventType: string) {
  return eventType.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())
}

function eventTone(eventType: string) {
  if (eventType.includes('recover')) return 'success'
  if (eventType.includes('fail') || eventType.includes('error')) return 'danger'
  if (eventType.includes('reset') || eventType.includes('gap')) return 'warning'
  return 'neutral'
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.floor(milliseconds / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function relativeTime(value: Date, now: number) {
  const seconds = Math.max(0, Math.round((now - value.getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}
