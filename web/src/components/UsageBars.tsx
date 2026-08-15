import type { UsageSeries } from '../types'
import { formatBytes } from '../utils/format'

export function UsageBars({ series }: { series: UsageSeries }) {
  const maximum = Math.max(...series.points.map((point) => point.totalBytes), 1)
  return (
    <div className={`usage-bars usage-bars-${series.granularity}`}>
      {series.points.map((point) => (
        <div
          className="usage-row"
          key={point.period}
          title={`${formatPeriod(point.period, series.granularity, false)}: ${formatBytes(point.totalBytes)}`}
        >
          <time dateTime={point.period}>
            {formatPeriod(point.period, series.granularity, series.from === series.to)}
          </time>
          <div className="bar-track">
            <span style={{ width: `${Math.max((point.totalBytes / maximum) * 100, 1)}%` }} />
          </div>
          <strong>{formatBytes(point.totalBytes)}</strong>
        </div>
      ))}
    </div>
  )
}

function formatPeriod(period: string, granularity: UsageSeries['granularity'], singleDay: boolean) {
  const value = parseLocalPeriod(period)
  if (!value) return period
  if (granularity === 'hour') {
    const time = value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    if (singleDay) return time
    const date = value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${date}, ${time}`
  }
  if (granularity === 'month') {
    return value.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }
  const date = value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return granularity === 'week' ? `Week of ${date}` : date
}

function parseLocalPeriod(period: string) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/.exec(period)
  if (!match) return null
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3] ?? 1),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  )
}
