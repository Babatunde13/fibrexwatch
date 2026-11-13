import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Select,
  TextInput,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCalendarTime,
  IconCheck,
  IconDatabaseExport,
  IconFileTypeCsv,
  IconJson,
  IconPrinter,
} from '@tabler/icons-react'
import {
  downloadBackup,
  generatedReportURL,
  getGeneratedReports,
  getReportSchedule,
  getUsageSeries,
  saveReportSchedule,
  usageCSVURL,
  usageJSONURL,
} from '../api'
import type { GeneratedReport, ReportSchedule, UsageSeries } from '../types'
import { dateValue } from '../utils/dates'
import { formatBytes } from '../utils/format'

type ReportPeriod = 'week' | 'month' | 'previous-month' | 'custom'
type BackupRecord = { downloadedAt: string; filename: string; size: number }
type BackupReminderDays = 0 | 7 | 30 | 90

const backupRecordKey = 'fibrexwatch:last-backup'
const backupReminderKey = 'fibrexwatch:backup-reminder-days'

function storedBackupRecord(): BackupRecord | null {
  try {
    const value = window.localStorage.getItem(backupRecordKey)
    return value ? (JSON.parse(value) as BackupRecord) : null
  } catch {
    return null
  }
}

function storedBackupReminder(): BackupReminderDays {
  try {
    const value = Number(window.localStorage.getItem(backupReminderKey))
    return value === 7 || value === 30 || value === 90 ? value : 0
  } catch {
    return 0
  }
}

export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('week')
  const [series, setSeries] = useState<UsageSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const initialCustomRange = useMemo(() => reportRange('week'), [])
  const [customFrom, setCustomFrom] = useState(initialCustomRange.from)
  const [customTo, setCustomTo] = useState(initialCustomRange.to)
  const [customRange, setCustomRange] = useState(initialCustomRange)
  const [schedule, setSchedule] = useState<ReportSchedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleSaved, setScheduleSaved] = useState(false)
  const [archives, setArchives] = useState<GeneratedReport[]>([])
  const [archivesLoading, setArchivesLoading] = useState(true)
  const [archivesError, setArchivesError] = useState('')
  const [backupDownloading, setBackupDownloading] = useState(false)
  const [backupError, setBackupError] = useState('')
  const [lastBackup, setLastBackup] = useState<BackupRecord | null>(storedBackupRecord)
  const [backupReminderDays, setBackupReminderDays] =
    useState<BackupReminderDays>(storedBackupReminder)
  const [backupCheckTime, setBackupCheckTime] = useState(() => Date.now())
  const range = useMemo(() => reportRange(period, customRange), [period, customRange])
  const backupOverdue =
    backupReminderDays > 0 &&
    (!lastBackup ||
      backupCheckTime - new Date(lastBackup.downloadedAt).getTime() >
        backupReminderDays * 86_400_000)

  const applyCustomRange = () => {
    if (!customFrom || !customTo) {
      setError('Choose both a start and end date.')
      return
    }
    if (customTo < customFrom) {
      setError('The end date must be on or after the start date.')
      return
    }
    const days = (new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86_400_000
    if (days > 366) {
      setError('Custom reports cannot exceed 366 days.')
      return
    }
    setCustomRange({ from: customFrom, to: customTo, label: 'Custom report' })
    setPeriod('custom')
  }

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void getReportSchedule()
        .then((result) => {
          if (active) setSchedule(result)
        })
        .catch((reason: unknown) => {
          if (active) {
            setScheduleError(reason instanceof Error ? reason.message : 'Could not load schedule')
          }
        })
        .finally(() => {
          if (active) setScheduleLoading(false)
        })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void getGeneratedReports()
        .then((result) => {
          if (active) setArchives(result.reports)
        })
        .catch((reason: unknown) => {
          if (active) {
            setArchivesError(
              reason instanceof Error ? reason.message : 'Could not load report archive',
            )
          }
        })
        .finally(() => {
          if (active) setArchivesLoading(false)
        })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  const updateSchedule = async () => {
    if (!schedule) return
    setScheduleSaving(true)
    setScheduleError('')
    setScheduleSaved(false)
    try {
      setSchedule(
        await saveReportSchedule({
          frequency: schedule.frequency,
          weekday: schedule.weekday,
          monthDay: schedule.monthDay,
        }),
      )
      setScheduleSaved(true)
    } catch (reason) {
      setScheduleError(reason instanceof Error ? reason.message : 'Could not save schedule')
    } finally {
      setScheduleSaving(false)
    }
  }

  const exportBackup = async () => {
    setBackupDownloading(true)
    setBackupError('')
    try {
      const { blob, filename } = await downloadBackup()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      const record = { downloadedAt: new Date().toISOString(), filename, size: blob.size }
      try {
        window.localStorage.setItem(backupRecordKey, JSON.stringify(record))
      } catch {
        // The download still succeeded when browser storage is unavailable.
      }
      setLastBackup(record)
      setBackupCheckTime(Date.now())
    } catch (reason) {
      setBackupError(reason instanceof Error ? reason.message : 'Could not download backup')
    } finally {
      setBackupDownloading(false)
    }
  }

  const updateBackupReminder = (value: string | null) => {
    const days = Number(value) as BackupReminderDays
    setBackupReminderDays(days)
    try {
      window.localStorage.setItem(backupReminderKey, String(days))
    } catch {
      // The preference remains active for this browser session.
    }
  }

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
        <div className="report-filters">
          <SegmentedControl
            value={period}
            data={[
              { value: 'week', label: 'Last 7 days' },
              { value: 'month', label: 'This month' },
              { value: 'previous-month', label: 'Previous month' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(value) => setPeriod(value as ReportPeriod)}
          />
          {period === 'custom' && (
            <form
              className="report-custom-range"
              onSubmit={(event) => {
                event.preventDefault()
                applyCustomRange()
              }}
            >
              <TextInput
                label="From"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
              <TextInput
                label="To"
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(event) => setCustomTo(event.target.value)}
              />
              <Button
                type="submit"
                color="dark"
              >
                Apply
              </Button>
            </form>
          )}
        </div>
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
              <Group
                gap="xs"
                className="report-actions"
              >
                <Button
                  variant="default"
                  leftSection={<IconPrinter size={16} />}
                  onClick={() => window.print()}
                >
                  Print
                </Button>
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
      <article className="panel report-schedule">
        <div className="panel-heading">
          <div>
            <p className="panel-label">Local automation</p>
            <h2>Recurring reports</h2>
            <p>
              Organise usage into recurring periods. Reports remain local and become available in
              this dashboard after each period closes.
            </p>
          </div>
          <IconCalendarTime size={24} />
        </div>
        {scheduleLoading && (
          <div className="schedule-loading">
            <Loader size="sm" /> Loading schedule…
          </div>
        )}
        {scheduleError && (
          <Alert
            color="red"
            title="Schedule unavailable"
            icon={<IconAlertTriangle size={18} />}
          >
            {scheduleError}
          </Alert>
        )}
        {!scheduleLoading && schedule && (
          <form
            className="schedule-form"
            onSubmit={(event) => {
              event.preventDefault()
              void updateSchedule()
            }}
          >
            <Select
              label="Frequency"
              value={schedule.frequency}
              data={[
                { value: 'off', label: 'Off' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              allowDeselect={false}
              onChange={(value) =>
                setSchedule({
                  ...schedule,
                  frequency: value ?? 'off',
                })
              }
            />
            {schedule.frequency === 'weekly' && (
              <Select
                label="Period closes on"
                value={String(schedule.weekday)}
                allowDeselect={false}
                data={weekdays.map((label, value) => ({ value: String(value), label }))}
                onChange={(value) => setSchedule({ ...schedule, weekday: Number(value) })}
              />
            )}
            {schedule.frequency === 'monthly' && (
              <NumberInput
                label="Period closes on day"
                value={schedule.monthDay}
                min={1}
                max={28}
                onChange={(value) => setSchedule({ ...schedule, monthDay: Number(value) || 1 })}
              />
            )}
            <Button
              type="submit"
              color="dark"
              loading={scheduleSaving}
            >
              Save schedule
            </Button>
            <div
              className="schedule-status"
              aria-live="polite"
            >
              {schedule.frequency === 'off' ? (
                <span>Recurring reports are off.</span>
              ) : (
                <span>
                  Next report period closes{' '}
                  <strong>{schedule.nextReportAt || 'after saving'}</strong>.
                </span>
              )}
              {scheduleSaved && (
                <Badge
                  color="teal"
                  variant="light"
                  leftSection={<IconCheck size={12} />}
                >
                  Saved
                </Badge>
              )}
            </div>
          </form>
        )}
      </article>
      <article className="panel report-archive">
        <div className="panel-heading">
          <div>
            <p className="panel-label">Immutable snapshots</p>
            <h2>Report archive</h2>
            <p>
              Closed periods are generated by the worker and preserved with their original totals.
            </p>
          </div>
          <Badge variant="light">{archives.length} saved</Badge>
        </div>
        {archivesLoading && (
          <div className="schedule-loading">
            <Loader size="sm" /> Loading archive…
          </div>
        )}
        {archivesError && (
          <Alert
            color="red"
            title="Archive unavailable"
            icon={<IconAlertTriangle size={18} />}
          >
            {archivesError}
          </Alert>
        )}
        {!archivesLoading && !archivesError && !archives.length && (
          <div className="archive-empty">
            <strong>No archived reports yet</strong>
            <span>Enable a schedule. The worker will save the most recently closed period.</span>
          </div>
        )}
        {!!archives.length && (
          <div className="archive-list">
            {archives.map((report) => (
              <div
                className="archive-row"
                key={report.id}
              >
                <div>
                  <Badge
                    color="gray"
                    variant="light"
                  >
                    {report.frequency}
                  </Badge>
                  <strong>
                    {report.periodStart} – {report.periodEnd}
                  </strong>
                  <span>Generated {new Date(report.generatedAt).toLocaleString()}</span>
                </div>
                <div className="archive-total">
                  <span>Total usage</span>
                  <strong>{formatBytes(report.totalBytes)}</strong>
                </div>
                <Group
                  gap="xs"
                  className="archive-actions"
                >
                  <Button
                    component="a"
                    href={generatedReportURL(report.id, 'csv')}
                    size="compact-sm"
                    variant="default"
                    leftSection={<IconFileTypeCsv size={14} />}
                  >
                    CSV
                  </Button>
                  <Button
                    component="a"
                    href={generatedReportURL(report.id, 'json')}
                    size="compact-sm"
                    variant="default"
                    leftSection={<IconJson size={14} />}
                  >
                    JSON
                  </Button>
                </Group>
              </div>
            ))}
          </div>
        )}
      </article>
      <article className="panel backup-export">
        <div>
          <span className="backup-icon">
            <IconDatabaseExport size={22} />
          </span>
          <div>
            <p className="panel-label">Data portability</p>
            <h2>Local JSON backup</h2>
            <p>
              Download readings, normalized usage, devices, events, settings, and archived reports.
              Router credentials, users, sessions, and pending control requests are excluded.
            </p>
          </div>
        </div>
        <div className="backup-actions">
          <Select
            label="Remind me"
            aria-label="Backup reminder interval"
            value={String(backupReminderDays)}
            onChange={updateBackupReminder}
            allowDeselect={false}
            data={[
              { value: '0', label: 'Never' },
              { value: '7', label: 'Every 7 days' },
              { value: '30', label: 'Every 30 days' },
              { value: '90', label: 'Every 90 days' },
            ]}
          />
          <Button
            onClick={() => void exportBackup()}
            loading={backupDownloading}
            color="dark"
            leftSection={<IconDatabaseExport size={17} />}
          >
            Download backup
          </Button>
        </div>
        <div
          className="backup-status"
          aria-live="polite"
        >
          {backupError && <span className="backup-error">{backupError}</span>}
          {!backupError && lastBackup && (
            <span>
              Last exported {new Date(lastBackup.downloadedAt).toLocaleString()} ·{' '}
              {formatBytes(lastBackup.size)} · {lastBackup.filename}
            </span>
          )}
          {!backupError && !lastBackup && (
            <span>No backup has been downloaded from this browser yet.</span>
          )}
        </div>
        {backupOverdue && (
          <Alert
            color="orange"
            title={lastBackup ? 'Backup reminder' : 'Create your first backup'}
            icon={<IconAlertTriangle size={18} />}
          >
            {lastBackup
              ? `Your last backup is older than ${backupReminderDays} days.`
              : 'No backup has been downloaded from this browser.'}
          </Alert>
        )}
        <Alert
          color="yellow"
          title="Keep this file private"
          icon={<IconAlertTriangle size={18} />}
        >
          The backup contains local device identifiers such as MAC and IP addresses.
        </Alert>
      </article>
    </section>
  )
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function reportRange(period: ReportPeriod, custom = { from: '', to: '', label: 'Custom report' }) {
  if (period === 'custom') return custom
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
