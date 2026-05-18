import { createClient } from '@/lib/supabase/client'
import type {
  HitoCatalogo,
  MapaServicioInstancia,
  MinutaCliente,
  ServiceMapKPIs,
  ChecklistItemSnapshot,
  TipoServicio,
  ClientPlan,
  TipoMinuta,
} from '@/lib/types'

// ── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Normalize plan string for comparison (removes accents, lowercase)
 * 'Esencial' -> 'esencial', 'Estratégico' -> 'estrategico'
 */
function normalizePlan(plan: string): TipoServicio {
  const normalized = plan.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return normalized === 'esencial' ? 'esencial' : 'estrategico'
}

/**
 * Check if client plan is Esencial (case/accent insensitive)
 */
function isEsencial(plan: ClientPlan): boolean {
  return normalizePlan(plan) === 'esencial'
}

/**
 * Calculate which week of the month a hito should appear in based on frecuencia
 */
function calculateSemanaDelMes(frecuencia: string, instanceIndex: number = 0): number {
  switch (frecuencia) {
    case 'Semanal':
    case 'Semanal (Lun)':
    case 'Semanal (Vie)':
      // Weekly: one per week, 1-4
      return (instanceIndex % 4) + 1
    case '2 Veces x Sem':
      // Twice per week: weeks 1, 2, 3, 4 (two instances per week)
      return Math.floor(instanceIndex / 2) + 1
    case 'Mensual':
      // Monthly: first week
      return 1
    case 'Bimestral':
      // Bimonthly: first week (only appears on odd/even months)
      return 1
    default:
      return 1
  }
}

/**
 * Get the number of instances per month for a given frecuencia
 */
function getInstancesPerMonth(frecuencia: string): number {
  switch (frecuencia) {
    case 'Semanal':
    case 'Semanal (Lun)':
    case 'Semanal (Vie)':
      return 4
    case '2 Veces x Sem':
      return 8
    case 'Mensual':
      return 1
    case 'Bimestral':
      return 1 // Will be filtered by month parity
    default:
      return 1
  }
}

/**
 * Check if a bimonthly hito should appear in a given month
 */
function shouldAppearInMonth(frecuencia: string, mes: number, hitoOrden: number): boolean {
  if (frecuencia !== 'Bimestral') return true
  // Bimestral: odd/even months based on hito order
  return mes % 2 === hitoOrden % 2
}

// ── Core Service Map Functions ────────────────────────────────────────────────

/**
 * Generate all instances for a client for a given month
 * Uses ON CONFLICT DO NOTHING to avoid duplicates
 */
export async function generateMonthInstances(
  clienteId: string,
  mes: number,
  anio: number,
  planCliente: ClientPlan
): Promise<{ success: boolean; error?: string; generated?: number }> {
  const supabase = createClient()

  try {
    // 1. Fetch catalog filtered by plan (normalized comparison)
    const tipoServicioNormalized = normalizePlan(planCliente)
    
    let query = supabase.from('hitos_catalogo').select('*').order('orden', { ascending: true })
    
    // Esencial clients only see 'esencial' hitos, Estrategico/Premium see all
    if (isEsencial(planCliente)) {
      query = query.eq('tipo_servicio', 'esencial')
    }

    const { data: hitos, error: hitosError } = await query

    if (hitosError) throw hitosError
    if (!hitos || hitos.length === 0) return { success: true, generated: 0 }

    // 2. Generate instances for each hito
    const instanciasToInsert: Array<{
      cliente_id: string
      hito_id: string
      mes: number
      anio: number
      semana_del_mes: number
      estado: string
      tipo_servicio_cliente: TipoServicio
    }> = []

    for (const hito of hitos as HitoCatalogo[]) {
      // Check if bimestral hito should appear this month
      if (!shouldAppearInMonth(hito.frecuencia, mes, hito.orden)) {
        continue
      }

      const instancesCount = getInstancesPerMonth(hito.frecuencia)

      for (let i = 0; i < instancesCount; i++) {
        instanciasToInsert.push({
          cliente_id: clienteId,
          hito_id: hito.id,
          mes,
          anio,
          semana_del_mes: calculateSemanaDelMes(hito.frecuencia, i),
          estado: 'pendiente',
          tipo_servicio_cliente: normalizePlan(planCliente),
        })
      }
    }

    if (instanciasToInsert.length === 0) return { success: true, generated: 0 }

    // 3. Insert with ON CONFLICT DO NOTHING (using upsert with ignoreDuplicates)
    const { data: inserted, error: insertError } = await supabase
      .from('mapa_servicio_instancias')
      .upsert(instanciasToInsert, {
        onConflict: 'cliente_id,hito_id,mes,anio,semana_del_mes',
        ignoreDuplicates: true,
      })
      .select()

    if (insertError) throw insertError

    // 4. For hitos with genera_tarea = true, create tasks
    const hitosConTarea = (hitos as HitoCatalogo[]).filter((h) => h.genera_tarea)

    for (const hito of hitosConTarea) {
      // Find instances we just created for this hito
      const { data: instancias } = await supabase
        .from('mapa_servicio_instancias')
        .select('id, tarea_id')
        .eq('cliente_id', clienteId)
        .eq('hito_id', hito.id)
        .eq('mes', mes)
        .eq('anio', anio)
        .is('tarea_id', null)

      if (!instancias) continue

      for (const instancia of instancias) {
        // Create task with hito_poe reference
        const { data: newTask, error: taskError } = await supabase
          .from('tareas')
          .insert({
            titulo: `[Hito] ${hito.nombre}`,
            descripcion: hito.descripcion,
            cliente_id: clienteId,
            estado: 'pendiente',
            prioridad: 'media',
            hito_poe: hito.id,
            es_tarea_sistema: true,
          })
          .select('id')
          .single()

        if (taskError || !newTask) continue

        // Update instance with tarea_id
        await supabase
          .from('mapa_servicio_instancias')
          .update({ tarea_id: newTask.id })
          .eq('id', instancia.id)
      }
    }

    return { success: true, generated: inserted?.length ?? instanciasToInsert.length }
  } catch (error) {
    console.error('[service-map] Error generating instances:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Complete a service map instance when a task with hito_poe is resolved
 */
export async function completeInstance(
  instanciaId: string,
  completadoPor: string,
  checklistSnapshot: ChecklistItemSnapshot[],
  checklistCompleto: boolean,
  linkDrive?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    // 1. Get the instance with its hito data
    const { data: instancia, error: instanciaError } = await supabase
      .from('mapa_servicio_instancias')
      .select(
        `
        *,
        hito:hitos_catalogo(*)
      `
      )
      .eq('id', instanciaId)
      .single()

    if (instanciaError || !instancia) {
      throw new Error('Instance not found')
    }

    // 2. Update the instance
    const today = new Date().toISOString().split('T')[0] // DATE format YYYY-MM-DD

    const { error: updateError } = await supabase
      .from('mapa_servicio_instancias')
      .update({
        estado: 'listo',
        completado_por: completadoPor,
        fecha_completado: today,
        checklist_snapshot: checklistSnapshot,
        checklist_completo: checklistCompleto,
        link_drive: linkDrive || null,
      })
      .eq('id', instanciaId)

    if (updateError) throw updateError

    // 3. Create automatic comment
    const hitoNombre = (instancia.hito as HitoCatalogo)?.nombre || 'Hito'
    const tipo = checklistCompleto ? 'hito_completado' : 'hito_incompleto'
    const mensaje = checklistCompleto
      ? `✅ Hito completado: ${hitoNombre} · Checklist completo`
      : `⚠️ Hito cerrado con checklist incompleto: ${hitoNombre}`

    const { error: commentError } = await supabase.from('comentarios_clientes').insert({
      cliente_id: instancia.cliente_id,
      contenido: mensaje,
      tipo,
      colaborador_id: completadoPor,
      autor: 'Sistema',
    })

    if (commentError) {
      console.error('[service-map] Error creating comment:', commentError)
      // Non-critical error, don't fail the operation
    }

    return { success: true }
  } catch (error) {
    console.error('[service-map] Error completing instance:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get all service map instances for a client for a given month/year
 */
export async function getClientServiceMap(
  clienteId: string,
  mes?: number,
  anio?: number
): Promise<{ data: MapaServicioInstancia[] | null; error?: string }> {
  const supabase = createClient()

  try {
    const now = new Date()
    const targetMes = mes ?? now.getMonth() + 1
    const targetAnio = anio ?? now.getFullYear()

    const { data, error } = await supabase
      .from('mapa_servicio_instancias')
      .select(
        `
        *,
        hito:hitos_catalogo(*)
      `
      )
      .eq('cliente_id', clienteId)
      .eq('mes', targetMes)
      .eq('anio', targetAnio)
      .order('hito(orden)', { ascending: true })

    if (error) throw error

    return { data: data as MapaServicioInstancia[] }
  } catch (error) {
    console.error('[service-map] Error fetching client service map:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get aggregated KPIs for service map report
 */
export async function getServiceMapKPIs(filters?: {
  mes?: number
  anio?: number
  planFilter?: ClientPlan
  pmFilter?: string
  amFilter?: string
}): Promise<{ data: ServiceMapKPIs[] | null; error?: string }> {
  const supabase = createClient()

  try {
    const now = new Date()
    const mes = filters?.mes ?? now.getMonth() + 1
    const anio = filters?.anio ?? now.getFullYear()

    // Fetch all instances for the month with client data
    let query = supabase
      .from('mapa_servicio_instancias')
      .select(
        `
        *,
        hito:hitos_catalogo(nombre),
        cliente:clientes(id, nombre_del_negocio, plan, project_manager_id, account_manager_id)
      `
      )
      .eq('mes', mes)
      .eq('anio', anio)

    const { data, error } = await query

    if (error) throw error
    if (!data) return { data: [] }

    // Group by client and calculate KPIs
    const clientMap = new Map<string, ServiceMapKPIs>()

    for (const row of data) {
      const cliente = row.cliente as {
        id: string
        nombre_del_negocio: string
        plan: ClientPlan
        project_manager_id: string | null
        account_manager_id: string | null
      }

      if (!cliente) continue

    // Apply filters (normalize plan comparison)
    if (filters?.planFilter && normalizePlan(cliente.plan) !== normalizePlan(filters.planFilter)) continue
      if (filters?.pmFilter && cliente.project_manager_id !== filters.pmFilter) continue
      if (filters?.amFilter && cliente.account_manager_id !== filters.amFilter) continue

      let kpi = clientMap.get(cliente.id)

      if (!kpi) {
        kpi = {
          clientId: cliente.id,
          clientName: cliente.nombre_del_negocio,
          plan: cliente.plan,
          totalHitos: 0,
          completados: 0,
          progresoPercent: 0,
          checklistsCompletos: 0,
          checklistCompletoPercent: 0,
          ultimoHito: null,
          ultimaFecha: null,
          projectManagerId: cliente.project_manager_id,
          accountManagerId: cliente.account_manager_id,
        }
        clientMap.set(cliente.id, kpi)
      }

      kpi.totalHitos++

      if (row.estado === 'listo') {
        kpi.completados++
        if (row.checklist_completo) {
          kpi.checklistsCompletos++
        }
        // Track last completed hito
        if (!kpi.ultimaFecha || (row.fecha_completado && row.fecha_completado > kpi.ultimaFecha)) {
          kpi.ultimaFecha = row.fecha_completado
          kpi.ultimoHito = (row.hito as { nombre: string })?.nombre || null
        }
      }
    }

    // Calculate percentages
    const result: ServiceMapKPIs[] = []
    for (const kpi of clientMap.values()) {
      kpi.progresoPercent = kpi.totalHitos > 0 ? Math.round((kpi.completados / kpi.totalHitos) * 100) : 0
      kpi.checklistCompletoPercent =
        kpi.completados > 0 ? Math.round((kpi.checklistsCompletos / kpi.completados) * 100) : 0
      result.push(kpi)
    }

    // Sort by progress descending
    result.sort((a, b) => b.progresoPercent - a.progresoPercent)

    return { data: result }
  } catch (error) {
    console.error('[service-map] Error fetching KPIs:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get instance by task ID (for completing from task panel)
 */
export async function getInstanceByTaskId(
  tareaId: string
): Promise<{ data: MapaServicioInstancia | null; error?: string }> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase
      .from('mapa_servicio_instancias')
      .select(
        `
        *,
        hito:hitos_catalogo(*)
      `
      )
      .eq('tarea_id', tareaId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return { data: null }
      }
      throw error
    }

    return { data: data as MapaServicioInstancia }
  } catch (error) {
    console.error('[service-map] Error fetching instance by task:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get hito by ID
 */
export async function getHitoById(hitoId: string): Promise<{ data: HitoCatalogo | null; error?: string }> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.from('hitos_catalogo').select('*').eq('id', hitoId).single()

    if (error) throw error

    return { data: data as HitoCatalogo }
  } catch (error) {
    console.error('[service-map] Error fetching hito:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// ── Minutas Functions ─────────────────────────────────────────────────────────

/**
 * Get all minutas for a client
 */
export async function getClientMinutas(
  clienteId: string
): Promise<{ data: MinutaCliente[] | null; error?: string }> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase
      .from('minutas_cliente')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })

    if (error) throw error

    return { data: data as MinutaCliente[] }
  } catch (error) {
    console.error('[service-map] Error fetching minutas:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Create a new minuta
 */
export async function createMinuta(minuta: {
  cliente_id: string
  titulo: string
  contenido?: string
  fecha: string
  tipo: TipoMinuta
  autor?: string
  colaborador_id?: string
}): Promise<{ data: MinutaCliente | null; error?: string }> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.from('minutas_cliente').insert(minuta).select().single()

    if (error) throw error

    return { data: data as MinutaCliente }
  } catch (error) {
    console.error('[service-map] Error creating minuta:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Update a minuta
 */
export async function updateMinuta(
  minutaId: string,
  updates: Partial<{
    titulo: string
    contenido: string
    fecha: string
    tipo: TipoMinuta
  }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    const { error } = await supabase
      .from('minutas_cliente')
      .update({ ...updates, actualizado_en: new Date().toISOString() })
      .eq('id', minutaId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('[service-map] Error updating minuta:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Delete a minuta
 */
export async function deleteMinuta(minutaId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    const { error } = await supabase.from('minutas_cliente').delete().eq('id', minutaId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('[service-map] Error deleting minuta:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// ── Catalog Admin Functions ───────────────────────────────────────────────────

/**
 * Get all hitos from catalog
 */
export async function getAllHitos(): Promise<{ data: HitoCatalogo[] | null; error?: string }> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.from('hitos_catalogo').select('*').order('orden', { ascending: true })

    if (error) throw error

    return { data: data as HitoCatalogo[] }
  } catch (error) {
    console.error('[service-map] Error fetching all hitos:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
  
/**
 * Check if a hito has future (non-completed) instances
 */
export async function checkHitoHasFutureInstances(hitoId: string): Promise<boolean> {
  const supabase = createClient()
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const { count, error } = await supabase
    .from('mapa_servicio_instancias')
    .select('*', { count: 'exact', head: true })
    .eq('hito_id', hitoId)
    .neq('estado', 'listo')
    .or(`anio.gt.${currentYear},and(anio.eq.${currentYear},mes.gte.${currentMonth})`)

  if (error) {
    console.error('Error checking future instances:', error)
    return false
  }

  return (count ?? 0) > 0
}
  
/**
* Update a hito in catalog and regenerate affected instances
*/
export async function updateCatalogHito(
  hitoId: string,
  updates: Partial<HitoCatalogo>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    // 1. Update the catalog entry
    const { error: updateError } = await supabase.from('hitos_catalogo').update(updates).eq('id', hitoId)

    if (updateError) throw updateError

    // 2. Delete future non-completed instances
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const { error: deleteError } = await supabase
      .from('mapa_servicio_instancias')
      .delete()
      .eq('hito_id', hitoId)
      .neq('estado', 'listo')
      .or(`anio.gt.${currentYear},and(anio.eq.${currentYear},mes.gt.${currentMonth})`)

    if (deleteError) {
      console.error('[service-map] Error deleting future instances:', deleteError)
      // Non-critical, continue
    }

    return { success: true }
  } catch (error) {
    console.error('[service-map] Error updating catalog hito:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
