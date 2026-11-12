import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, SegmentedControl } from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconFileTypeCsv,
  IconJson,
} from '@tabler/icons-react'
import { getUsageSeries, usageCSVURL, usageJSONURL } from '../api'
import type { UsageSeries } from '../types'
import { dateValue } from '../utils/dates'
import { formatBytes } from '../utils/format'

type ReportPeriod = 'week' | 'month' | 'previous-month'

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('week')
  const [series, setSeries] = useState<UsageSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const range = useMemo(() => reportRange(period), [period])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void getUsageSeries(range.from, range.to, 'day')
        .then((result) => {
          if (active) setSeries(result)
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(reason instanceof Error ? reason.message : 'Could not generate report')
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [range])

  const totals = useMemo(() => {
    const points = series?.points ?? []
    const download = points.reduce((sum, point) => sum + point.downloadBytes, 0)
    const upload = points.reduce((sum, point) => sum + point.uploadBytes, 0)
    const peak = points.reduce<(typeof points)[number] | null>(
      (highest, point) => (!highest || point.totalBytes > highest.totalBytes ? point : highest),
      null,
    )
    return {
      download,
      upload,
      peak,
      average: points.length ? series!.totalBytes / points.length : 0,
    }
  }, [series])

  return (
    <section className="reports-page">
      <article className="panel reports-toolbar">
        <div>
          <p className="panel-label">Generate report</p>
          <h2>{range.label}</h2>
          <span>
            {range.from} – {range.to}
          </span>
        </div>
        <SegmentedControl
          value={period}
          data={[
            { value: 'week', label: 'Last 7 days' },
            { value: 'month', label: 'This month' },
            { value: 'previous-month', label: 'Previous month' },
          ]}
          onChange={(value) => setPeriod(value as ReportPeriod)}
        />
      </article>

      {error && (
        <Alert
          color="red"
          title="Report unavailable"
          icon={<IconAlertTriangle size={20} />}
        >
          {error}
        </Alert>
      )}
      {loading && (
        <div className="panel reports-loading">
          <Loader color="mtn" />
          <span>Generating report from stored readings…</span>
        </div>
      )}
      {!loading && !error && series && (
        <>
          <div className="report-summary-grid">
            <ReportMetric
              label="Total usage"
              value={formatBytes(series.totalBytes)}
            />
            <ReportMetric
              label="Downloaded"
              value={formatBytes(totals.download)}
            />
            <ReportMetric
              label="Uploaded"
              value={formatBytes(totals.upload)}
            />
            <ReportMetric
              label="Daily average"
              value={formatBytes(totals.average)}
            />
          </div>
          <article className="panel report-detail">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Usage statement</p>
                <h2>Daily breakdown</h2>
              </div>
              <Group gap="xs">
                <Button
                  component="a"
                  href={usageCSVURL(range.from, range.to, 'day')}
                  variant="default"
                  leftSection={<IconFileTypeCsv size={16} />}
                >
                  CSV
                </Button>
                <Button
                  component="a"
                  href={usageJSONURL(range.from, range.to, 'day')}
                  variant="default"
                  leftSection={<IconJson size={16} />}
                >
                  JSON
                </Button>
              </Group>
            </div>
            <div className="report-comparison">
              <div>
                <span>Compared with the preceding period</span>
                <strong className={series.changePercentage > 0 ? 'increase' : 'decrease'}>
                  {series.changePercentage > 0 ? (
                    <IconArrowUp size={16} />
                  ) : (
                    <IconArrowDown size={16} />
                  )}
                  {Math.abs(series.changePercentage).toFixed(1)}%
                </strong>
              </div>
              <div>
                <span>Peak day</span>
                <strong>
                  {totals.peak
                    ? `${new Date(totals.peak.period).toLocaleDateString()} · ${formatBytes(totals.peak.totalBytes)}`
                    : 'No readings'}
                </strong>
              </div>
            </div>
            {series.points.length ? (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Download</th>
                      <th>Upload</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.points.map((point) => (
                      <tr key={point.period}>
                        <td>{new Date(point.period).toLocaleDateString()}</td>
                        <td>{formatBytes(point.downloadBytes)}</td>
                        <td>{formatBytes(point.uploadBytes)}</td>
                        <td>{formatBytes(point.totalBytes)}</td>
                        <td>
                          <Badge
                            color={point.readingCount ? 'teal' : 'gray'}
                            variant="light"
                          >
                            {point.readingCount ? `${point.readingCount} readings` : 'No data'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="reports-empty">
                <strong>No readings in this period</strong>
                <span>The report will populate after the collector records usage.</span>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  )
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function reportRange(period: ReportPeriod) {
  const today = new Date()
  if (period === 'week') {
    const from = new Date(today)
    from.setDate(from.getDate() - 6)
    return { from: dateValue(from), to: dateValue(today), label: 'Last 7 days' }
  }
  const target = new Date(
    today.getFullYear(),
    today.getMonth() - (period === 'previous-month' ? 1 : 0),
    1,
  )
  const end = new Date(target.getFullYear(), target.getMonth() + 1, 0)
  if (period === 'month' && end > today) end.setTime(today.getTime())
  return {
    from: dateValue(target),
    to: dateValue(end),
    label: period === 'month' ? 'Current month' : 'Previous month',
  }
}
