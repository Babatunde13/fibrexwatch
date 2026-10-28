import { AreaChart } from '@mantine/charts'
import type { UsageSeries } from '../types'
import { formatBytes } from '../utils/format'

export function UsageBars({ series }: { series: UsageSeries }) {
  const data = series.points.map((point) => ({
    period: formatPeriod(point.period, series.granularity, series.from === series.to),
    Download: point.downloadBytes,
    Upload: point.uploadBytes,
  }))
  return (
    <AreaChart
      className="usage-chart"
      h={300}
      data={data}
      dataKey="period"
      series={[
        { name: 'Download', color: 'mtn.6' },
        { name: 'Upload', color: 'blue.5' },
      ]}
      curveType="monotone"
      type="stacked"
      withLegend
      withDots={data.length < 20}
      valueFormatter={formatBytes}
      tickLine="y"
      gridAxis="xy"
    />
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
