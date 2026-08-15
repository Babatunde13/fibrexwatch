import { apiBase, get } from './client'
import type { UsageHistory, UsageSeries, UsageSummary } from '../types'

export const getTodayUsage = () => get<UsageSummary>('/api/v1/usage/today')

export const getMonthUsage = (month?: string) =>
  get<UsageSummary>(`/api/v1/usage/month${month ? `?month=${encodeURIComponent(month)}` : ''}`)

export const getDailyUsage = (from: string, to: string) =>
  get<UsageHistory>(
    `/api/v1/usage/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )

export const getUsageSeries = (from: string, to: string, granularity: UsageSeries['granularity']) =>
  get<UsageSeries>(
    `/api/v1/usage/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`,
  )

export const usageCSVURL = (from: string, to: string, granularity: UsageSeries['granularity']) =>
  `${apiBase}/api/v1/usage/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}&format=csv`

export const usageJSONURL = (from: string, to: string, granularity: UsageSeries['granularity']) =>
  `${apiBase}/api/v1/usage/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}&format=json`
