import type { CSSProperties } from 'react'
import type { UsageSeries } from '../types'
import { formatBytes } from '../utils/format'

export function UsageHeatmap({ series }: { series: UsageSeries }) {
  const max = Math.max(...series.points.map((point) => point.totalBytes), 1)
  return (
    <div
      className="usage-heatmap"
      aria-label="Hourly usage heatmap"
    >
      {series.points.map((point) => {
        const date = new Date(point.period)
        const intensity = Math.max(0.08, point.totalBytes / max)
        return (
          <div
            key={point.period}
            className="heatmap-cell"
            style={{ '--heat': intensity } as CSSProperties}
            title={`${date.toLocaleString()}: ${formatBytes(point.totalBytes)}`}
          >
            <span>{date.getHours().toString().padStart(2, '0')}</span>
          </div>
        )
      })}
    </div>
  )
}
