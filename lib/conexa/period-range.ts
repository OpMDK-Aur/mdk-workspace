const toISODate = (date: Date) => date.toISOString().slice(0, 10)

// El selector de período de la UI ofrece opciones de texto libre ("Hoy",
// "Ayer", "Últimos 7 días", "Este mes", "Mes anterior", "Personalizado") que
// no siempre contienen un número parseable. Antes, cualquier período sin un
// dígito (p. ej. "Ayer") caía al default de 30 días, inflando las métricas
// ~30x contra lo que se ve en Meta/Google Ads para ese mismo día.
// Lo comparten la API de datos y la UI para que el rango mostrado sea el consultado.
export function dateRange(period: string, customRange?: { from?: string; to?: string }, today = new Date()) {
  const normalized = period.trim().toLowerCase()

  if (normalized === 'personalizado' && customRange?.from && customRange?.to) {
    return { dateFrom: customRange.from, dateTo: customRange.to }
  }
  if (normalized === 'hoy') {
    return { dateFrom: toISODate(today), dateTo: toISODate(today) }
  }
  if (normalized === 'ayer') {
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    return { dateFrom: toISODate(yesterday), dateTo: toISODate(yesterday) }
  }
  if (normalized === 'este mes') {
    const from = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1)
    return { dateFrom: toISODate(from), dateTo: toISODate(today) }
  }
  if (normalized === 'mes anterior') {
    const from = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    const to = new Date(today.getUTCFullYear(), today.getUTCMonth(), 0)
    return { dateFrom: toISODate(from), dateTo: toISODate(to) }
  }
  const match = normalized.match(/(\d+)/)
  const days = match ? Number(match[1]) : 30
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - days + 1)
  return { dateFrom: toISODate(from), dateTo: toISODate(today) }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function formatShort(iso: string, withYear: boolean) {
  const [year, month, day] = iso.split('-')
  return withYear ? `${day}/${month}/${year.slice(2)}` : `${day}/${month}`
}

export function formatPeriodRange(period: string, customRange?: { from?: string; to?: string }) {
  if (!period) return ''
  if (period.trim().toLowerCase() === 'personalizado' && !(customRange?.from && customRange?.to)) return 'Elegí desde y hasta'
  const { dateFrom, dateTo } = dateRange(period, customRange)
  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo)) return ''
  const currentYear = String(new Date().getUTCFullYear())
  const withYear = dateFrom.slice(0, 4) !== currentYear || dateTo.slice(0, 4) !== currentYear
  if (dateFrom === dateTo) return formatShort(dateFrom, withYear)
  return `Del ${formatShort(dateFrom, withYear)} al ${formatShort(dateTo, withYear)}`
}
