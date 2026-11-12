import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Loader } from '@mantine/core'
import {
  IconAlertTriangle,
  IconCheck,
  IconCode,
  IconDownload,
  IconFileSearch,
  IconHistory,
  IconShieldCheck,
} from '@tabler/icons-react'
import { getRouterScan, runRouterScan } from '../api'
import type { RouterScan } from '../types'

export function RouterInspectorPage() {
  const [scan, setScan] = useState<RouterScan | null>(null)
  const [history, setHistory] = useState<RouterScan[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    const result = await getRouterScan()
    setScan(result.scan)
    setHistory(result.history)
    return result.scan
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : 'Could not load router scan'),
        )
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!scan || scan.completedAt) return
    const timer = window.setInterval(() => {
      void refresh()
        .then((latest) => {
          if (latest?.completedAt) setRequesting(false)
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'Could not refresh router scan')
          setRequesting(false)
        })
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [scan])

  const startScan = async () => {
    setRequesting(true)
    setError('')
    try {
      await runRouterScan()
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start router scan')
      setRequesting(false)
    }
  }

  const running = requesting || (!!scan && !scan.completedAt)
  const previousScan = history.find(
    (candidate) => candidate.id !== scan?.id && candidate.completedAt && !candidate.error,
  )

  const exportScan = () => {
    if (!scan?.completedAt || scan.error) return
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), scan }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `router-inspection-${scan.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  if (loading) {
    return (
      <div className="panel inspector-loading">
        <Loader color="mtn" />
        <span>Loading inspection status…</span>
      </div>
    )
  }

  return (
    <section className="router-inspector">
      <div className="inspector-guardrail">
        <span>
          <IconShieldCheck size={24} />
        </span>
        <div>
          <strong>Read-only and sanitized</strong>
          <p>
            The worker checks a fixed set of authenticated local pages using GET requests. Values,
            credentials, cookies, tokens, and configuration changes are never retained.
          </p>
        </div>
        <Button
          ml="auto"
          color="dark"
          loading={running}
          leftSection={<IconFileSearch size={17} />}
          onClick={() => void startScan()}
        >
          {scan ? 'Scan again' : 'Scan router'}
        </Button>
      </div>

      {error && (
        <Alert
          color="red"
          title="Router scan unavailable"
          icon={<IconAlertTriangle size={20} />}
        >
          {error}
        </Alert>
      )}
      {scan?.error && (
        <Alert
          color="red"
          title="Last scan failed"
          icon={<IconAlertTriangle size={20} />}
        >
          {scan.error}
        </Alert>
      )}
      {running && (
        <Alert
          color="blue"
          title="Inspection in progress"
          icon={<IconFileSearch size={20} />}
        >
          The authenticated worker is checking supported router pages. This normally takes less than
          30 seconds.
        </Alert>
      )}

      {scan?.completedAt && !scan.error && (
        <>
          <div className="inspector-summary-grid">
            <InspectorMetric
              label="Landing page"
              value={scan.result.landingPath || 'Unknown'}
            />
            <InspectorMetric
              label="Pages discovered"
              value={scan.result.pagePaths.length}
            />
            <InspectorMetric
              label="Assets referenced"
              value={scan.result.assetPaths.length}
            />
            <InspectorMetric
              label="Counter candidates"
              value={scan.result.counterPages.length}
            />
          </div>
          <article className="panel inspector-results">
            <Group
              justify="space-between"
              align="flex-start"
            >
              <div>
                <p className="panel-label">Latest inspection</p>
                <h2>Discovered capabilities</h2>
              </div>
              <Group gap="xs">
                <Badge
                  color="teal"
                  variant="light"
                  leftSection={<IconCheck size={12} />}
                >
                  Completed {new Date(scan.completedAt).toLocaleString()}
                </Badge>
                <Button
                  size="compact-sm"
                  variant="default"
                  leftSection={<IconDownload size={15} />}
                  onClick={exportScan}
                >
                  Export JSON
                </Button>
              </Group>
            </Group>
            <ScanComparison
              current={scan}
              previous={previousScan}
            />
            <InspectorSection
              title="Local pages"
              values={scan.result.pagePaths}
            />
            <InspectorSection
              title="Data field names"
              values={scan.result.dataFields}
            />
            <InspectorSection
              title="Structure signatures"
              values={scan.result.structures}
            />
            <div className="counter-candidates">
              <h3>Counter candidates</h3>
              {scan.result.counterPages.length ? (
                scan.result.counterPages.map((page) => (
                  <div
                    className="counter-candidate"
                    key={page.path}
                  >
                    <code>{page.path}</code>
                    <span>{page.fields.length} relevant fields</span>
                    <div>
                      {page.fields.map((field) => (
                        <Badge
                          key={field}
                          variant="light"
                          color="gray"
                        >
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="inspector-empty">No additional counter pages were identified.</p>
              )}
            </div>
          </article>
        </>
      )}
      {history.length > 0 && (
        <article className="panel inspector-history">
          <div className="panel-heading">
            <div>
              <p className="panel-label">Audit trail</p>
              <h2>Recent inspections</h2>
            </div>
            <IconHistory size={22} />
          </div>
          <div className="inspection-list">
            {history.map((item) => {
              const status = scanStatus(item)
              return (
                <div
                  className="inspection-row"
                  key={item.id}
                >
                  <span className={`inspection-status ${status.name}`} />
                  <div>
                    <strong>Inspection #{item.id}</strong>
                    <span>{new Date(item.requestedAt).toLocaleString()}</span>
                  </div>
                  <Badge
                    color={status.color}
                    variant="light"
                  >
                    {status.label}
                  </Badge>
                  <span className="inspection-count">{status.detail}</span>
                </div>
              )
            })}
          </div>
        </article>
      )}
      {!scan && !error && (
        <div className="panel inspector-empty-state">
          <IconCode size={30} />
          <strong>No router inspection has been run</strong>
          <span>Start a scan to inventory sanitized console paths and capability names.</span>
        </div>
      )}
    </section>
  )
}

function ScanComparison({ current, previous }: { current: RouterScan; previous?: RouterScan }) {
  if (!previous) {
    return (
      <div className="scan-comparison comparison-baseline">
        <strong>Baseline inspection saved</strong>
        <span>Future scans will highlight added and removed pages and fields.</span>
      </div>
    )
  }
  const changes = [
    ...diff(previous.result.pagePaths, current.result.pagePaths, 'page'),
    ...diff(previous.result.dataFields, current.result.dataFields, 'field'),
  ]
  return (
    <div className="scan-comparison">
      <div>
        <strong>Changes since inspection #{previous.id}</strong>
        <span>
          {changes.length
            ? `${changes.length} structural changes found`
            : 'No structural changes found'}
        </span>
      </div>
      {changes.length > 0 && (
        <div className="comparison-changes">
          {changes.map((change) => (
            <Badge
              key={`${change.kind}-${change.type}-${change.value}`}
              color={change.kind === 'added' ? 'teal' : 'red'}
              variant="light"
            >
              {change.kind === 'added' ? '+' : '−'} {change.type}: {change.value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function diff(previous: string[], current: string[], type: 'page' | 'field') {
  const before = new Set(previous)
  const after = new Set(current)
  return [
    ...current
      .filter((value) => !before.has(value))
      .map((value) => ({ kind: 'added', type, value })),
    ...previous
      .filter((value) => !after.has(value))
      .map((value) => ({ kind: 'removed', type, value })),
  ]
}

function scanStatus(scan: RouterScan) {
  if (scan.error) {
    return { name: 'failed', color: 'red', label: 'Failed', detail: scan.error }
  }
  if (scan.completedAt) {
    return {
      name: 'completed',
      color: 'teal',
      label: 'Completed',
      detail: `${scan.result.pagePaths.length} pages · ${scan.result.dataFields.length} fields`,
    }
  }
  return { name: 'running', color: 'blue', label: 'Running', detail: 'Waiting for worker' }
}

function InspectorMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function InspectorSection({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {values.length ? (
        <div>
          {values.map((value) => (
            <code key={value}>{value}</code>
          ))}
        </div>
      ) : (
        <p className="inspector-empty">Nothing was reported for this category.</p>
      )}
    </section>
  )
}
