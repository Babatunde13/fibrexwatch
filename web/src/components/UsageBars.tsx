import { AreaChart, LineChart } from '@mantine/charts'
import { Group, SegmentedControl, Text } from '@mantine/core'
import { useState } from 'react'
import type { UsageSeries } from '../types'
import { formatBytes } from '../utils/format'

export function UsageBars({ series }: { series: UsageSeries }) {
  const [view, setView] = useState<'area' | 'line'>('area')
  const data = series.points.map((point) => ({
    period: formatPeriod(point.period, series.granularity, series.from === series.to),
    Download: point.downloadBytes,
    Upload: point.uploadBytes,
  }))
  const sharedProps = {
    className: 'usage-chart',
    h: 300,
    data,
    dataKey: 'period',
    series: [
      { name: 'Download', color: 'mtn.6' },
      { name: 'Upload', color: 'blue.5' },
    ],
    curveType: 'monotone' as const,
    withLegend: true,
    withDots: data.length < 20,
    valueFormatter: formatBytes,
    tickLine: 'y' as const,
    gridAxis: 'xy' as const,
  }
  return (
    <div>
      <Group
        className="chart-view-toolbar"
        justify="space-between"
      >
        <Text
          size="xs"
          c="dimmed"
        >
          Hover or focus the chart to inspect exact usage.
        </Text>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(value) => setView(value)}
          data={[
            { value: 'area', label: 'Stacked' },
            { value: 'line', label: 'Lines' },
          ]}
        />
      </Group>
      {view === 'area' ? (
        <AreaChart
          {...sharedProps}
          type="stacked"
        />
      ) : (
        <LineChart {...sharedProps} />
      )}
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
