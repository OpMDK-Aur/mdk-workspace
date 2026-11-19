export type AureliaTimeEntry = {
  id: string
  colaboradorId: string
  colaboradorName: string
  clientId: string
  clientName: string | null
  descripcion: string | null
  fecha: string
  iniciadoEn: string
  finalizadoEn: string | null
  duracionSeg: number | null
}

export type AureliaTimeData =
  | { available: false; message: string }
  | { available: true; entries: AureliaTimeEntry[]; running: AureliaTimeEntry | null; userId: string }

/** Fecha calendario en Argentina, que es como se cargan las horas de MDK. */
export function todayInArgentina(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
}

/** Segundos de una entrada; las que siguen corriendo cuentan hasta ahora. */
export function entrySeconds(entry: AureliaTimeEntry, now = Date.now()) {
  if (entry.finalizadoEn) return entry.duracionSeg ?? Math.max(0, Math.round((new Date(entry.finalizadoEn).getTime() - new Date(entry.iniciadoEn).getTime()) / 1000))
  return Math.max(0, Math.round((now - new Date(entry.iniciadoEn).getTime()) / 1000))
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${String(minutes).padStart(2, '0')} min`
}

export function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':')
}

/** Segundos por cliente dentro de un rango de fechas (yyyy-mm-dd, ambos inclusive). */
export function secondsByClient(entries: AureliaTimeEntry[], fromDate?: string, toDate?: string, now = Date.now()) {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (fromDate && entry.fecha < fromDate) continue
    if (toDate && entry.fecha > toDate) continue
    totals.set(entry.clientId, (totals.get(entry.clientId) ?? 0) + entrySeconds(entry, now))
  }
  return totals
}
