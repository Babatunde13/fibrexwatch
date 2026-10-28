import { Paper, Text, ThemeIcon } from '@mantine/core'
import type { ReactNode } from 'react'

export function Metric({
  label,
  value,
  featured = false,
  icon,
}: {
  label: string
  value: string
  featured?: boolean
  icon: ReactNode
}) {
  return (
    <Paper
      component="article"
      className={`metric ${featured ? 'featured' : ''}`}
      withBorder
      radius="lg"
    >
      <div className="metric-heading">
        <ThemeIcon
          className="metric-icon"
          variant={featured ? 'white' : 'light'}
          color={featured ? 'dark' : 'mtn'}
          radius="md"
          size="lg"
        >
          {icon}
        </ThemeIcon>
        <Text
          component="p"
          size="sm"
          fw={650}
        >
          {label}
        </Text>
      </div>
      <Text
        component="strong"
        fw={800}
      >
        {value}
      </Text>
    </Paper>
  )
}
