import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Loader } from '@mantine/core'
import { IconAlertTriangle, IconWorld, IconWifi } from '@tabler/icons-react'
import { getNetworkQuality } from '../api'
import type { CollectorEvent, NetworkQualityHistory, SystemStatus } from '../types'

export function NetworkHealthPage({
  status,
  events,
  now,
}: {
  status: SystemStatus
  events: CollectorEvent[]
  now: number
}) {
  const [quality, setQuality] = useState<NetworkQualityHistory | null>(null)
  const [qualityLoading, setQualityLoading] = useState(true)
  const [qualityError, setQualityError] = useState('')
  const lastReading = status.lastCollectedAt ? new Date(status.lastCollectedAt) : null
  const readingAge = lastReading ? Math.max(0, now - lastReading.getTime()) : null
  const expectedInterval = status.collectionIntervalSeconds * 1000
  let freshness = 'No readings yet'
  if (readingAge !== null) freshness = readingAge <= expectedInterval * 2 ? 'Fresh' : 'Delayed'
  const workerUptime = status.worker
    ? formatDuration(Math.max(0, now - new Date(status.worker.startedAt).getTime()))
    : 'Unavailable'
  const qualitySummary = useMemo(() => summarizeQuality(quality), [quality])

  useEffect(() => {
    let active = true
    const load = () => {
      void getNetworkQuality()
        .then((result) => {
          if (!active) return
          setQuality(result)
          setQualityError('')
        })
        .catch((error: unknown) => {
          if (active) {
            setQualityError(
              error instanceof Error ? error.message : 'Could not load network quality',
            )
          }
        })
        .finally(() => {
          if (active) setQualityLoading(false)
        })
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

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

      <article className="panel quality-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-label">Connection checks</p>
            <h2>Network quality</h2>
            <p>Bounded TCP and DNS probes distinguish router, internet, and resolver failures.</p>
          </div>
          {qualitySummary && (
            <Badge
              variant="light"
              color={qualitySummary.internetAvailability >= 99 ? 'teal' : 'orange'}
            >
              {qualitySummary.internetAvailability}% internet availability
            </Badge>
          )}
        </div>
        {qualityLoading && !quality && (
          <div className="quality-loading">
            <Loader size="sm" /> Loading quality measurements…
          </div>
        )}
        {qualityError && !quality && (
          <Alert
            color="red"
            title="Network quality unavailable"
            icon={<IconAlertTriangle size={18} />}
          >
            {qualityError}
          </Alert>
        )}
        {!qualityLoading && !qualityError && !qualitySummary && (
          <div className="health-empty-state">
            <IconWorld size={28} />
            <strong>Waiting for the first quality check</strong>
            <span>
              The worker records a measurement when it starts and at the configured interval.
            </span>
          </div>
        )}
        {qualitySummary && (
          <>
            {qualityError && (
              <Alert
                color="orange"
                title="Showing the last available measurements"
              >
                {qualityError}
              </Alert>
            )}
            <div className="quality-metrics">
              <QualityMetric
                label="Gateway"
                reachable={qualitySummary.latest.gatewayReachable}
                latency={qualitySummary.latest.gatewayLatencyMs}
                detail={`${qualitySummary.latest.gatewayLossPercent}% sample loss`}
              />
              <QualityMetric
                label="Internet"
                reachable={qualitySummary.latest.internetReachable}
                latency={qualitySummary.latest.internetLatencyMs}
                detail={`${qualitySummary.latest.internetLossPercent}% sample loss`}
              />
              <QualityMetric
                label="DNS"
                reachable={qualitySummary.latest.dnsReachable}
                latency={qualitySummary.latest.dnsLatencyMs}
                detail="System resolver"
              />
            </div>
            <div className="quality-history-wrap">
              <table className="quality-history">
                <caption>Most recent network-quality checks</caption>
                <thead>
                  <tr>
                    <th>Checked</th>
                    <th>Gateway</th>
                    <th>Internet</th>
                    <th>DNS</th>
                  </tr>
                </thead>
                <tbody>
                  {qualitySummary.recent.map((reading) => (
                    <tr key={reading.id}>
                      <td>{new Date(reading.recordedAt).toLocaleTimeString()}</td>
                      <td>{qualityValue(reading.gatewayReachable, reading.gatewayLatencyMs)}</td>
                      <td>{qualityValue(reading.internetReachable, reading.internetLatencyMs)}</td>
                      <td>{qualityValue(reading.dnsReachable, reading.dnsLatencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

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

function QualityMetric({
  label,
  reachable,
  latency,
  detail,
}: {
  label: string
  reachable: boolean
  latency: number | null
  detail: string
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{reachable && latency !== null ? `${latency} ms` : 'Unavailable'}</strong>
      <small>{reachable ? detail : 'Probe failed'}</small>
    </article>
  )
}

function summarizeQuality(history: NetworkQualityHistory | null) {
  const readings = history?.readings ?? []
  if (!readings.length) return null
  const latest = readings.at(-1)!
  const internetSuccesses = readings.filter((reading) => reading.internetReachable).length
  return {
    latest,
    internetAvailability: Math.round((internetSuccesses / readings.length) * 1000) / 10,
    recent: readings.slice(-12).reverse(),
  }
}

function qualityValue(reachable: boolean, latency: number | null) {
  return reachable && latency !== null ? `${latency} ms` : 'Failed'
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
