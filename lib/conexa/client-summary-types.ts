export const SUMMARY_FOCUS_PRESETS = [
  { value: 'todo', label: 'Toda la gestión' },
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'diseno', label: 'Diseño' },
] as const

export const SUMMARY_PERIODS = [
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'all', label: 'Desde el inicio' },
] as const

export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number]['value']

export const MAX_CUSTOM_FOCUS = 80

export type SummaryItem = { text: string; taskId: string | null }

export type ClientManagementSummary = {
  focusLabel: string
  period: SummaryPeriod
  summary: string
  done: SummaryItem[]
  inProgress: SummaryItem[]
  blockers: SummaryItem[]
  nextSteps: SummaryItem[]
  tasksConsidered: number
  tasksTotal: number
  byState: Record<string, number>
  generatedAt: string
}

export function focusLabelFor(focus: string): string {
  return SUMMARY_FOCUS_PRESETS.find(p => p.value === focus)?.label ?? focus
}
