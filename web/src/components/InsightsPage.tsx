import { Badge } from '@mantine/core'
import {
  IconActivityHeartbeat,
  IconCalendarStats,
  IconChartLine,
  IconDevices,
  IconTrendingUp,
} from '@tabler/icons-react'
import type { Device, PlanUsage, SystemStatus, UsageSeries, UsageSummary } from '../types'
import { formatBytes } from '../utils/format'

type InsightTone = 'positive' | 'neutral' | 'warning' | 'critical'

type Insight = {
  title: string
  metric: string
  description: string
  tone: InsightTone
  icon: typeof IconChartLine
  action: { label: string; path: string }
}

export function InsightsPage({
  usage,
  series,
  plan,
  devices,
  status,
  newDeviceCount,
}: {
  usage: UsageSummary
  series: UsageSeries | null
  plan: PlanUsage | null
  devices: Device[]
  status: SystemStatus
  newDeviceCount: number
}) {
  const insights = buildInsights(usage, series, plan, devices, status, newDeviceCount)
  const attentionCount = insights.filter(
    (insight) => insight.tone === 'warning' || insight.tone === 'critical',
  ).length
  const assessment = attentionCount
    ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention`
    : 'Everything looks steady'

  return (
    <section className="insights-page">
      <div className="insights-summary">
        <div>
          <p className="panel-label">Current assessment</p>
          <strong>{assessment}</strong>
          <span>Insights use locally collected usage, plan, device, and worker data.</span>
        </div>
        <Badge
          size="lg"
          variant="light"
          color={attentionCount ? 'orange' : 'teal'}
        >
          {attentionCount ? 'Review suggested' : 'No urgent findings'}
        </Badge>
      </div>

      <div className="insights-grid">
        {insights.map((insight) => {
          const InsightIcon = insight.icon
          return (
            <article
              className={`insight-card ${insight.tone}`}
              key={insight.title}
            >
              <div className="insight-card-heading">
                <span className="insight-icon">
                  <InsightIcon size={20} />
                </span>
                <Badge
                  size="sm"
                  variant="light"
                  color={toneColor(insight.tone)}
                >
                  {insight.tone}
                </Badge>
              </div>
              <p>{insight.title}</p>
              <strong>{insight.metric}</strong>
              <span>{insight.description}</span>
              <a href={insight.action.path}>{insight.action.label} →</a>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function buildInsights(
  usage: UsageSummary,
  series: UsageSeries | null,
  plan: PlanUsage | null,
  devices: Device[],
  status: SystemStatus,
  newDeviceCount: number,
): Insight[] {
  const activeDevices = devices.filter((device) => !device.archivedAt)
  const onlineDevices = activeDevices.filter((device) => device.online).length
  const trend = series?.changePercentage ?? 0
  const peak = series?.points.reduce<(typeof series.points)[number] | null>(
    (current, point) => (!current || point.totalBytes > current.totalBytes ? point : current),
    null,
  )
  const uploadShare =
    usage.totalBytes && usage.uploadBytes !== null
      ? (usage.uploadBytes / usage.totalBytes) * 100
      : null

  const results: Insight[] = [
    {
      title: 'Usage compared with the previous period',
      metric: series?.previousTotalBytes
        ? `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`
        : 'Building baseline',
      description: trendDescription(series, trend),
      tone: series?.previousTotalBytes && trend > 20 ? 'warning' : 'neutral',
      icon: IconTrendingUp,
      action: { label: 'Review usage', path: '/analytics' },
    },
    {
      title: 'Highest usage period',
      metric: peak ? formatBytes(peak.totalBytes) : 'No peak yet',
      description: peak
        ? `The highest ${series?.granularity ?? 'daily'} period began ${new Date(peak.period).toLocaleString()}.`
        : 'Peak usage will appear after the collector stores history for this range.',
      tone: 'neutral',
      icon: IconChartLine,
      action: { label: 'Inspect chart', path: '/analytics' },
    },
    plan?.configured
      ? {
          title: 'Data-plan forecast',
          metric: formatBytes(plan.projectedBytes),
          description:
            plan.projectedBytes > plan.allowanceBytes
              ? `Current usage is projected to exceed the allowance by ${formatBytes(plan.projectedBytes - plan.allowanceBytes)}.`
              : `${formatBytes(plan.remainingBytes)} remains with ${plan.remainingDays} days left in this cycle.`,
          tone: plan.projectedBytes > plan.allowanceBytes ? 'critical' : 'positive',
          icon: IconCalendarStats,
          action: { label: 'Review plan', path: '/settings' },
        }
      : {
          title: 'Data-plan forecast',
          metric: 'Plan not configured',
          description:
            'Add your allowance and billing day to enable budget and exhaustion forecasts.',
          tone: 'warning',
          icon: IconCalendarStats,
          action: { label: 'Configure plan', path: '/settings' },
        },
    {
      title: 'Device activity',
      metric: `${onlineDevices} online`,
      description: newDeviceCount
        ? `${newDeviceCount} new device${newDeviceCount === 1 ? '' : 's'} appeared during the last 24 hours.`
        : `${activeDevices.length} known devices are being monitored, with no new arrivals in 24 hours.`,
      tone: newDeviceCount ? 'warning' : 'positive',
      icon: IconDevices,
      action: { label: 'Review devices', path: '/devices' },
    },
    {
      title: 'Collector reliability',
      metric: status.collectorState.replaceAll('-', ' '),
      description:
        status.collectorState === 'running'
          ? 'The worker heartbeat and latest reading are within the expected collection window.'
          : status.worker?.lastError || 'Collection is not currently in a healthy running state.',
      tone: status.collectorState === 'running' ? 'positive' : 'critical',
      icon: IconActivityHeartbeat,
      action: { label: 'Open network health', path: '/network-health' },
    },
  ]

  if (uploadShare !== null) {
    results.push({
      title: 'Today’s traffic direction',
      metric: `${uploadShare.toFixed(1)}% uploaded`,
      description: `${formatBytes(usage.downloadBytes)} downloaded and ${formatBytes(usage.uploadBytes)} uploaded today.`,
      tone: 'neutral',
      icon: IconChartLine,
      action: { label: 'View breakdown', path: '/analytics' },
    })
  }

  return results
}

function toneColor(tone: InsightTone) {
  if (tone === 'positive') return 'teal'
  if (tone === 'warning') return 'orange'
  if (tone === 'critical') return 'red'
  return 'gray'
}

function trendDescription(series: UsageSeries | null, trend: number) {
  if (!series?.previousTotalBytes) {
    return 'More history is needed before FibreX can calculate a reliable comparison.'
  }
  if (trend > 20) {
    return 'Consumption is materially higher than the comparable previous period.'
  }
  return 'Consumption remains close to your recent pattern.'
}
