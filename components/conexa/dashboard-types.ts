import type { ComponentType } from 'react'

export type DashboardMetric = { label: string; value: number }
export type DashboardPlatform = {
  key: string
  name: string
  color: string
  iconUrl: string | null
  icon: ComponentType<{ className?: string }>
  connected: boolean
  detail: string
}
export type DashboardRecord = Record<string, unknown>
export type DashboardBudgetSheet = DashboardRecord[]
export type DashboardBudget = {
  configured: boolean
  canUpload?: boolean
  fileName?: string
  publicUrl?: string
  updatedAt?: string | null
  rowCounts?: Record<string, number>
  sheets?: {
    general?: DashboardBudgetSheet
    meta?: DashboardBudgetSheet
    google?: DashboardBudgetSheet
    objetivosCpl?: DashboardBudgetSheet
  }
  error?: string
}
export type DashboardRegionRow = {
  region: string
  spend: number
  impressions: number
  clicks: number
  results: number
  leads: number
  account_count: number
  account_ids?: string[]
  account_names?: string[]
  cost_per_result: number
  cost_per_lead: number
  percent_of_results: number
  percent_of_leads: number
}
