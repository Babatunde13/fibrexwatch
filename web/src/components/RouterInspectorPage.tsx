import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Loader } from '@mantine/core'
import {
  IconAlertTriangle,
  IconCheck,
  IconCode,
  IconFileSearch,
  IconShieldCheck,
} from '@tabler/icons-react'
import { getRouterScan, runRouterScan } from '../api'
import type { RouterScan } from '../types'

export function RouterInspectorPage() {
  const [scan, setScan] = useState<RouterScan | null>(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    const result = await getRouterScan()
    setScan(result.scan)
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
            <Group justify="space-between">
              <div>
                <p className="panel-label">Latest inspection</p>
                <h2>Discovered capabilities</h2>
              </div>
              <Badge
                color="teal"
                variant="light"
                leftSection={<IconCheck size={12} />}
              >
                Completed {new Date(scan.completedAt).toLocaleString()}
              </Badge>
            </Group>
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
