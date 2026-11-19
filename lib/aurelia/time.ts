import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { todayInArgentina, type AureliaTimeData, type AureliaTimeEntry } from './time-shared'

export { todayInArgentina }

export const AURELIA_TIME_TABLE = 'entradas_de_tiempo_aurelia'
const LOOKBACK_DAYS = 400
const PAGE_SIZE = 1000
const MAX_ROWS = 20000

type Row = {
  id: string
  colaborador_id: string
  aurelia_client_id: string
  aurelia_client_name: string | null
  descripcion: string | null
  fecha: string
  iniciado_en: string
  finalizado_en: string | null
  duracion_seg: number | null
  colaboradores: { nombre: string | null; apellido: string | null } | null
}

const toEntry = (row: Row): AureliaTimeEntry => ({
  id: row.id,
  colaboradorId: row.colaborador_id,
  colaboradorName: [row.colaboradores?.nombre, row.colaboradores?.apellido].filter(Boolean).join(' ') || 'Colaborador',
  clientId: row.aurelia_client_id,
  clientName: row.aurelia_client_name,
  descripcion: row.descripcion,
  fecha: row.fecha,
  iniciadoEn: row.iniciado_en,
  finalizadoEn: row.finalizado_en,
  duracionSeg: row.duracion_seg,
})

export async function getAureliaTimeData(userId: string): Promise<AureliaTimeData> {
  const admin = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)
  const sinceDate = todayInArgentina(since)
  const columns = 'id,colaborador_id,aurelia_client_id,aurelia_client_name,descripcion,fecha,iniciado_en,finalizado_en,duracion_seg,colaboradores(nombre,apellido)'

  const rows: Row[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin.from(AURELIA_TIME_TABLE).select(columns).gte('fecha', sinceDate).order('fecha', { ascending: false }).order('id').range(from, from + PAGE_SIZE - 1)
    if (error) {
      const missingTable = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)
      return { available: false, message: missingTable ? 'Todavía no se creó la tabla entradas_de_tiempo_aurelia (falta correr la migración).' : `No se pudieron cargar las horas: ${error.message}` }
    }
    rows.push(...((data ?? []) as unknown as Row[]))
    if ((data ?? []).length < PAGE_SIZE) break
  }

  const entries = rows.map(toEntry)
  return { available: true, entries, running: entries.find((entry) => !entry.finalizadoEn && entry.colaboradorId === userId) ?? null, userId }
}
