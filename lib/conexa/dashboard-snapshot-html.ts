import { buildClaudeReportPrompt } from '@/lib/ai/monthly-report'

type Metric = { label: string; value: number }
type Snapshot = { clientName?: string; period?: string; range?: { dateFrom?: string; dateTo?: string }; platformMetrics?: Record<string, Metric[]>; previousPlatformMetrics?: Record<string, Metric[]>; tables?: Array<{ title: string; platform: string; columns: string[]; rows: Record<string, unknown>[] }> }
type Report = { name: string; created_at: string; data_snapshot: Snapshot }

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
const titleFor = (key: string) => ({ meta: 'Meta Ads', google: 'Google Ads', analytics: 'GA4', tag_manager: 'Tag Manager', crm: 'CRM' } as Record<string, string>)[key] ?? key

function metricCards(snapshot: Snapshot) {
  const metrics = Object.entries(snapshot.platformMetrics ?? {}).flatMap(([platform, rows]) => rows.map((row) => ({ platform, ...row, previous: (snapshot.previousPlatformMetrics?.[platform] ?? []).find((item) => item.label === row.label)?.value }))).slice(0, 24)
  return metrics.map((metric) => { const variation = typeof metric.previous === 'number' && metric.previous !== 0 ? `${(((metric.value - metric.previous) / Math.abs(metric.previous)) * 100).toFixed(1)}% vs. período anterior` : ''; return `<article class="metric"><p>${escapeHtml(titleFor(metric.platform))} · ${escapeHtml(metric.label)}</p><strong>${escapeHtml(new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Number(metric.value ?? 0)))}</strong>${variation ? `<small>${escapeHtml(variation)}</small>` : ''}</article>` }).join('')
}

function metricChart(snapshot: Snapshot) {
  const values = Object.entries(snapshot.platformMetrics ?? {}).flatMap(([platform, rows]) => rows.map((row) => ({ label: `${titleFor(platform)} · ${row.label}`, value: Number(row.value ?? 0) }))).filter((item) => Number.isFinite(item.value)).slice(0, 10)
  if (!values.length) return ''
  const max = Math.max(1, ...values.map((item) => item.value))
  const bars = values.map((item, index) => {
    const y = index * 28 + 8
    const width = Math.max(2, Math.min(520, item.value / max * 520))
    return `<text x="0" y="${y + 11}" class="chart-label">${escapeHtml(item.label.slice(0, 46))}</text><rect x="250" y="${y}" width="${width}" height="15" rx="4" fill="#F97316"/><text x="${Math.min(790, width + 260)}" y="${y + 11}" class="chart-value">${escapeHtml(new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(item.value))}</text>`
  }).join('')
  return `<svg role="img" aria-label="Gráfico de métricas por plataforma" viewBox="0 0 860 ${values.length * 28 + 16}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`
}

function tables(snapshot: Snapshot) {
  return (snapshot.tables ?? []).map((table) => `<section class="table-section"><h2>${escapeHtml(table.title)} · ${escapeHtml(titleFor(table.platform))}</h2><table><thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row) => `<tr>${table.columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('')
}

export function buildDashboardSnapshotHtml(report: Report) {
  const snapshot = report.data_snapshot ?? {}
  const start = snapshot.range?.dateFrom ?? ''
  const end = snapshot.range?.dateTo ?? ''
  const date = new Date(report.created_at).toLocaleString('es-AR')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.name)}</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f6f5;color:#202020;font:14px/1.55 Arial,sans-serif}.page{max-width:1100px;margin:auto;padding:36px}.brand{color:#F97316;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:11px}h1{font-size:26px;line-height:1.2;margin:5px 0}.meta{color:#777;font-size:12px;margin:0 0 24px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0 24px}.metric{border:1px solid #e4e4e2;border-radius:10px;background:#fff;padding:13px}.metric p{font-size:10px;color:#777;margin:0 0 7px}.metric strong{display:block;font-size:19px}.metric small{display:block;margin-top:5px;color:#777;font-size:10px}.chart{border:1px solid #e4e4e2;border-radius:10px;background:#fff;padding:18px;margin:20px 0}.chart svg{width:100%;height:auto}.chart-label{font:10px Arial;fill:#555}.chart-value{font:10px Arial;fill:#333}.table-section{margin:24px 0;break-inside:auto}.table-section h2{font-size:14px;margin:0 0 8px}table{width:100%;border-collapse:collapse;background:#fff;font-size:11px}th,td{padding:7px 9px;text-align:left;vertical-align:top;border:1px solid #e4e4e2;overflow-wrap:anywhere}th{background:#f1f1ef}tr{break-inside:avoid}.foot{margin-top:28px;border-top:1px solid #ddd;padding-top:12px;color:#777;font-size:10px}@media(max-width:650px){.page{padding:20px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{body{background:#fff}.page{max-width:none;padding:0}.table-section{break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}section,.metric{break-inside:avoid}}</style></head><body><main class="page"><p class="brand">Conexa · Dashboard</p><h1>${escapeHtml(report.name)}</h1><p class="meta">${escapeHtml(snapshot.clientName)} · ${escapeHtml(snapshot.period)} · ${escapeHtml(start)}${end ? ` – ${escapeHtml(end)}` : ''} · Guardado ${escapeHtml(date)}</p><section class="cards">${metricCards(snapshot)}</section><section class="chart"><h2>Métricas del snapshot</h2>${metricChart(snapshot)}</section>${tables(snapshot)}<p class="foot">Este documento reproduce el snapshot guardado. Los datos no se recalculan al abrir o descargar el informe.</p></main></body></html>`
}

export function buildClaudeDesignPrompt(report: Report) {
  const snapshot = report.data_snapshot ?? {}
  const summary = [
    `Período: ${snapshot.period ?? ''} (${snapshot.range?.dateFrom ?? ''} a ${snapshot.range?.dateTo ?? ''})`,
    `Objetivo del informe: Informe del Dashboard basado en el snapshot guardado ${report.name}.`,
    '',
    '## KPIs validados por plataforma',
    ...Object.entries(snapshot.platformMetrics ?? {}).flatMap(([platform, rows]) => [`### ${titleFor(platform)}`, ...rows.map((row) => { const previous = (snapshot.previousPlatformMetrics?.[platform] ?? []).find((item) => item.label === row.label); const variation = previous && previous.value !== 0 ? ` · anterior ${previous.value} · variación ${(((row.value - previous.value) / Math.abs(previous.value)) * 100).toFixed(1)}%` : previous?.value === 0 ? ' · anterior 0 · variación s/d' : ''; return `- ${row.label}: actual ${row.value}${variation}` })]),
    '',
    '## Tablas del snapshot',
    ...(snapshot.tables ?? []).flatMap((table) => [`### ${table.title} (${titleFor(table.platform)})`, table.columns.join(' | '), ...table.rows.map((row) => table.columns.map((column) => String(row[column] ?? '')).join(' | '))]),
    '',
    `Fecha del snapshot: ${new Date(report.created_at).toLocaleString('es-AR')}`,
    'No inventes ni recalcules datos; usá únicamente los valores incluidos.',
  ].join('\n')
  return buildClaudeReportPrompt({ clientName: snapshot.clientName ?? '', summary, charts: [] })
}
