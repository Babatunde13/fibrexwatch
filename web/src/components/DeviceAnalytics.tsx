import type { DeviceDetail, DeviceHistory } from '../types'

export function DeviceAnalytics({
  detail,
  history,
}: {
  detail: DeviceDetail
  history: DeviceHistory
}) {
  const totalOnlineSeconds = history.days.reduce(
    (total, day) => total + day.estimatedOnlineSeconds,
    0,
  )
  const onlineSamples = history.days.reduce((total, day) => total + day.onlineSamples, 0)
  const totalSamples = history.days.reduce((total, day) => total + day.totalSamples, 0)
  const sessions = history.days.reduce((total, day) => total + day.onlineSessions, 0)
  const coverage = totalSamples ? (onlineSamples / totalSamples) * 100 : 0
  const maxSeconds = Math.max(...history.days.map((day) => day.estimatedOnlineSeconds), 1)

  return (
    <>
      <div className="device-analytics-grid">
        <AnalyticsMetric
          label="Approx. online"
          value={formatDuration(totalOnlineSeconds)}
        />
        <AnalyticsMetric
          label="Active days"
          value={history.days.length.toString()}
        />
        <AnalyticsMetric
          label="Connections"
          value={sessions.toString()}
        />
        <AnalyticsMetric
          label="Online samples"
          value={`${coverage.toFixed(0)}%`}
        />
        <AnalyticsMetric
          label="Known IPs"
          value={detail.addresses.length.toString()}
        />
        <AnalyticsMetric
          label="Data used"
          value="Unavailable"
          muted
        />
      </div>

      {history.days.length ? (
        <div className="device-activity-chart">
          <h3>Daily online activity</h3>
          {history.days.map((day) => (
            <div
              className="device-activity-row"
              key={day.date}
            >
              <time>{shortDate(day.date)}</time>
              <div className="bar-track">
                <span style={{ width: `${(day.estimatedOnlineSeconds / maxSeconds) * 100}%` }} />
              </div>
              <strong>{formatDuration(day.estimatedOnlineSeconds)}</strong>
              <small>{day.onlineSessions} connections</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="dialog-state">No device snapshots recorded for this month.</div>
      )}
    </>
  )
}

function AnalyticsMetric({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className={muted ? 'muted' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatDuration(seconds: number) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = seconds / 3600
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`
}

function shortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
