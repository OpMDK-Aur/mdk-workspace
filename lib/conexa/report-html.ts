import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { CrmAcquisitionReport } from '@/lib/crm/service'

// Genera el mismo documento visual que se ve en el panel "Informe del
// período" del chat, para que la descarga en HTML/PDF luzca igual a lo que
// diseñó la IA en vez de un dump de texto plano.

type ReportSnapshot = {
  title: string
  clientName: string
  createdAt: string
  content: string
}

function markdownToHtml(markdown: string): string {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], children: markdown }))
}

function crmSection(crm?: CrmAcquisitionReport): string {
  if (!crm?.available) return ''

  const closeRate = crm.totals.contacts ? `${((crm.totals.sales / crm.totals.contacts) * 100).toFixed(1)}%` : 'Sin datos'
  const topCampaign = crm.campaignRows[0]?.label ?? 'Sin datos'
  const maxContacts = crm.campaignRows[0]?.contacts || 1

  const cards = [
    ['Contactos CRM', crm.totals.contacts.toLocaleString('es-AR')],
    ['Ventas ganadas', crm.totals.sales.toLocaleString('es-AR')],
    ['Tasa de cierre', closeRate],
    ['Campaña top', topCampaign],
  ]
    .map(([label, value]) => `<div class="card"><p class="card-label">${label}</p><p class="card-value">${value}</p></div>`)
    .join('')

  const bars = crm.campaignRows
    .slice(0, 5)
    .map((row) => `<div class="bar-row"><span class="bar-label" title="${row.label}">${row.label}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, (row.contacts / maxContacts) * 100)}%"></span></span><span class="bar-value">${row.contacts}</span></div>`)
    .join('')

  return `
    <section class="cards">${cards}</section>
    <section><h3>Top campañas por contactos</h3><div class="bars">${bars}</div></section>
  `
}

export function buildReportHtml(report: ReportSnapshot, crm?: CrmAcquisitionReport): string {
  const date = new Date(report.createdAt).toLocaleString('es-AR')
  const summaryHtml = markdownToHtml(report.content)

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${report.title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #f4f4f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #171717; }
  .page { max-width: 860px; margin: 0 auto; padding: 48px 40px 64px; }
  .brand { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #5b5fe8; margin: 0 0 6px; }
  h1 { font-size: 26px; font-weight: 700; letter-spacing: -.02em; margin: 0 0 6px; color: #101010; }
  .meta { font-size: 13px; color: #8b8b8b; margin: 0 0 32px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 28px; }
  .card { border: 1px solid #eee; background: #fafaf8; border-radius: 10px; padding: 14px; }
  .card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #999; margin: 0 0 6px; }
  .card-value { font-size: 18px; font-weight: 700; color: #141414; margin: 0; }
  h3 { font-size: 14px; font-weight: 700; color: #5b5fe8; margin: 0 0 10px; }
  .bars { display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px; }
  .bar-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .bar-label { width: 34%; flex-shrink: 0; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 8px; border-radius: 999px; background: #eeefff; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 999px; background: #5b5fe8; }
  .bar-value { width: 44px; flex-shrink: 0; text-align: right; font-weight: 600; color: #141414; }
  .summary { font-size: 14px; line-height: 1.6; color: #333; }
  .summary h1, .summary h2 { font-size: 16px; margin: 20px 0 8px; color: #101010; }
  .summary h3 { font-size: 14px; color: #101010; margin: 16px 0 6px; }
  .summary p { margin: 0 0 12px; }
  .summary ul, .summary ol { margin: 0 0 12px; padding-left: 20px; }
  .summary li { margin-bottom: 4px; }
  .summary table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  .summary th, .summary td { border: 1px solid #e6e6e3; padding: 8px 10px; text-align: left; }
  .summary th { background: #f5f5f8; font-weight: 700; }
  .sources { margin-top: 28px; padding-top: 16px; border-top: 1px solid #eee; font-size: 13px; color: #555; }
  @media print { body { background: #fff; } .page { padding: 0; } }
</style>
</head>
<body>
  <div class="page">
    <p class="brand">Conexa · Informe</p>
    <h1>${report.title}</h1>
    <p class="meta">${report.clientName} · ${date}</p>
    ${crmSection(crm)}
    <section><h3>Resumen ejecutivo</h3><div class="summary">${summaryHtml}</div></section>
    <div class="sources"><strong>Fuentes conectadas:</strong> Meta Ads · Google Ads · GA4 · CRM</div>
  </div>
</body>
</html>`
}
