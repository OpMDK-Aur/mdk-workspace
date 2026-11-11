export type DashboardMetricValue = { label: string; value: number }
export type DashboardMetricMap = Record<string, DashboardMetricValue[]>

function valueFor(metrics: DashboardMetricValue[], pattern: RegExp) {
  return metrics.find((metric) => pattern.test(metric.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))?.value
}

export function withDerivedDashboardMetrics(metricsByPlatform: DashboardMetricMap): DashboardMetricMap {
  const result = Object.fromEntries(Object.entries(metricsByPlatform).map(([platform, metrics]) => [platform, [...metrics]]))
  const meta = result.meta ?? []
  const metaSpend = valueFor(meta, /^(inversion|spend|cost)$/)
  const metaLeads = valueFor(meta, /^leads$/)
  const metaResults = valueFor(meta, /^resultados$/)
  if (metaSpend !== undefined && metaLeads !== undefined && metaLeads > 0 && !meta.some((metric) => /^cpl$/i.test(metric.label))) {
    meta.push({ label: 'CPL', value: metaSpend / metaLeads })
  }
  if (metaSpend !== undefined && metaResults !== undefined && metaResults > 0 && !meta.some((metric) => /costo por resultado/i.test(metric.label))) {
    meta.push({ label: 'Costo por resultado', value: metaSpend / metaResults })
  }
  const google = result.google ?? []
  const googleSpend = valueFor(google, /^(inversion|spend|cost)$/)
  const googleConversions = valueFor(google, /^(conversiones|conversions)$/)
  if (googleSpend !== undefined && googleConversions !== undefined && googleConversions > 0 && !google.some((metric) => /costo por conversion/i.test(metric.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
    google.push({ label: 'Costo por conversión', value: googleSpend / googleConversions })
  }
  result.meta = meta
  result.google = google
  return result
}
