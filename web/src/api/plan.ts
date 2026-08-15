import { get, patch } from './client'
import type { DataPlan, PlanUsage } from '../types'

export const getDataPlan = () => get<DataPlan>('/api/v1/settings/data-plan')
export const saveDataPlan = (
  plan: Pick<DataPlan, 'allowanceBytes' | 'billingDay' | 'alertThresholds'>,
) => patch<DataPlan>('/api/v1/settings/data-plan', plan)
export const getPlanUsage = () => get<PlanUsage>('/api/v1/usage/plan')
