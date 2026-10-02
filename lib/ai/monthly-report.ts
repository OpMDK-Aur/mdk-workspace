import type { ChartSpec } from './chart-spec'

export const MONTHLY_REPORT_PATTERN = /(crear|armar|generar|hacer)?\s*(un\s+)?informe\s+(mensual|del mes)|reporte\s+mensual/i
export const REPORT_CONFIRMATION_PATTERN = /^\s*(sí|si|correcto|está bien|esta bien|ok|confirmo)\b/i
export const VALIDATION_QUESTION = '¿La información es correcta?'
const VALIDATION_QUESTION_PATTERN = /la informaci[oó]n es correcta\?/i

export function isMonthlyReportRequest(text: string) {
  return MONTHLY_REPORT_PATTERN.test(text)
}

export function asksForValidation(text: string) {
  return VALIDATION_QUESTION_PATTERN.test(text)
}

const CHART_FENCE_PATTERN = /```(?:conexa-chart|chart)[ \t]*\r?\n[\s\S]*?```/g

function formatValue(value: number, prefix = '') {
  return `${prefix}${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

function formatVariation(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? '0%' : 's/d (anterior en 0)'
  const pct = ((cur - prev) / prev) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`
}

function chartLines(spec: ChartSpec) {
  if (spec.type === 'bars') {
    return spec.rows.map((row) => `- ${row.label}: actual ${formatValue(row.cur, spec.prefix)} · anterior ${formatValue(row.prev, spec.prefix)} · variación ${formatVariation(row.cur, row.prev)}`)
  }
  if (spec.type === 'columns') {
    return spec.labels.map((label, i) => `- ${label}: actual ${formatValue(spec.cur[i])} · anterior ${formatValue(spec.prev[i])} · variación ${formatVariation(spec.cur[i], spec.prev[i])}`)
  }
  return [
    ...spec.stages.map((stage) => `- ${stage.label}: actual ${formatValue(stage.cur)} · anterior ${formatValue(stage.prev)} · variación ${formatVariation(stage.cur, stage.prev)}${stage.highlight ? ' (mayor caída)' : ''}`),
    ...(spec.note ? [`- Nota: ${spec.note}`] : []),
  ]
}

function findField(text: string, label: RegExp) {
  const match = text.match(label)
  return match?.[1]?.replace(/\*+/g, '').trim() || null
}

export function buildClaudeReportPrompt({ clientName, summary, charts }: { clientName: string; summary: string; charts: ChartSpec[] }) {
  const cleanSummary = summary
    .replace(CHART_FENCE_PATTERN, '')
    .replace(VALIDATION_QUESTION_PATTERN, '')
    .replace(/¿\s*$/m, '')
    .trim()
  const period = findField(cleanSummary, /per[ií]odo[^:\n]*:\**\s*([^\n]+)/i) ?? 'el indicado en los datos validados'
  const objective = findField(cleanSummary, /objetivo(?: del informe)?[^:\n]*:\**\s*([^\n]+)/i) ?? 'Informe mensual de resultados de pauta y CRM'

  const kpiCharts = charts.filter((chart) => chart.type !== 'funnel')
  const funnelCharts = charts.filter((chart) => chart.type === 'funnel')

  return [
    `Cliente: ${clientName}`,
    `Período: ${period}`,
    `Objetivo del informe: ${objective}`,
    '',
    '## KPIs validados por plataforma (actual · anterior · variación)',
    ...(kpiCharts.length > 0
      ? kpiCharts.flatMap((chart) => [`### ${chart.title}`, ...chartLines(chart)])
      : ['Ver el detalle de KPIs en el resumen validado.']),
    '',
    '## Funnel del CRM',
    ...(funnelCharts.length > 0
      ? funnelCharts.flatMap((chart) => [`### ${chart.title}`, ...chartLines(chart)])
      : ['Ver el funnel en el resumen validado.']),
    '',
    '## Resumen validado (hallazgos y próximos pasos)',
    cleanSummary,
    '',
    'Armá un informe mensual para el cliente usando la plantilla Informe esencial de MDK. Usá solo estos datos.',
  ].join('\n')
}
