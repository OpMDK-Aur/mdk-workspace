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
 * Defaults to 'esencial' if plan is null/undefined
 */
function normalizePlan(plan: string | null | undefined): TipoServicio {
  if (!plan) return 'esencial'
  const normalized = plan.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return normalized === 'esencial' ? 'esencial' : 'estrategico'
}

/**
 * Check if client plan is Esencial (case/accent insensitive)
 */
function isEsencial(plan: ClientPlan | null | undefined): boolean {
  return normalizePlan(plan) === 'esencial'
}

/**
 * Calculate fecha_vencimiento based on year, month, and week number
 * Returns the last day of that week (Friday) or end of month if later
 */
function calculateFechaVencimiento(anio: number, mes: number, semana: number): string {
  // Get the last day of the month
  const lastDayOfMonth = new Date(anio, mes, 0).getDate()
  
  // Calculate approximate day based on week (7 days per week)
  // Week 1 = days 1-7, Week 2 = days 8-14, etc.
  let targetDay = semana * 7
  
  // Cap at last day of month
  if (targetDay > lastDayOfMonth) {
    targetDay = lastDayOfMonth
  }
  
  // Format as YYYY-MM-DD
  const date = new Date(anio, mes - 1, targetDay)
  return date.toISOString().split('T')[0]
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
 * Only generates for clients with unidad_negocio = 'MDK'
 */
export async function generateMonthInstances(
  clienteId: string,
  mes: number,
  anio: number,
  planCliente: ClientPlan
): Promise<{ success: boolean; error?: string; generated?: number }> {
  const supabase = createClient()

  try {
    // 0. Verify client belongs to MDK business unit (check array field)
    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .select('id, unidades_negocio, account_manager_id')
      .eq('id', clienteId)
      .single()

    if (clienteError || !cliente) {
      return { success: false, error: 'Client not found' }
    }

    // Check if MDK is in the unidades_negocio array
    const unidades = cliente.unidades_negocio as string[] | null
    if (!unidades || !unidades.includes('MDK')) {
      return { success: true, generated: 0 } // Skip non-MDK clients silently
    }

    const accountManagerId = cliente.account_manager_id

    // 1. Fetch catalog filtered by plan (normalized comparison)
    const tipoServicioNormalized = normalizePlan(planCliente)
    
    let query = supabase.from('hitos_catalogo').select('*').order('orden', { ascending: true })
    
    // Esencial clients only see 'esencial' hitos, Estrategico sees all
    if (isEsencial(planCliente)) {
      query = query.eq('tipo_servicio', 'esencial')
    }

    const { data: hitos, error: hitosError } = await query

    if (hitosError) throw hitosError
    if (!hitos || hitos.length === 0) {
      return { success: true, generated: 0 }
    }

    // 2. Generate instances for each hito
    const instanciasToInsert: Array<{
      cliente_id: string
      hito_id: string
      mes: number
      anio: number
      semana_del_mes: number
      estado: string
      tipo_servicio_cliente: TipoServicio
      fecha_vencimiento: string
    }> = []

    for (const hito of hitos as HitoCatalogo[]) {
      // Check if bimestral hito should appear this month
      if (!shouldAppearInMonth(hito.frecuencia, mes, hito.orden)) {
        continue
      }

      const instancesCount = getInstancesPerMonth(hito.frecuencia)

      for (let i = 0; i < instancesCount; i++) {
        const semana = calculateSemanaDelMes(hito.frecuencia, i)
        // Calculate fecha_vencimiento: last day of the week within the month
        const fechaVencimiento = calculateFechaVencimiento(anio, mes, semana)
        
        instanciasToInsert.push({
          cliente_id: clienteId,
          hito_id: hito.id,
          mes,
          anio,
          semana_del_mes: semana,
          estado: 'pendiente',
          tipo_servicio_cliente: normalizePlan(planCliente),
          fecha_vencimiento: fechaVencimiento,
        })
      }
    }

    if (instanciasToInsert.length === 0) {
      return { success: true, generated: 0 }
    }

    // 3. Insert instances one by one, ignoring duplicates
    let insertedCount = 0
    for (const instancia of instanciasToInsert) {
      const { error: insertError } = await supabase
        .from('mapa_servicio_instancias')
        .insert(instancia)
      
      if (insertError) {
        // Ignore duplicate key errors (code 23505)
        if (insertError.code === '23505') {
          continue
        }
        throw new Error(`Insert failed: ${insertError.message}`)
      }
      insertedCount++
    }

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
            asignado_a: accountManagerId, // Assign to account manager
            asignados_a: accountManagerId ? [accountManagerId] : [], // Array field
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

    return { success: true, generated: insertedCount }
  } catch (error) {
    console.error('[service-map] Error generating instances:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Create tasks for existing instances that are missing them (tarea_id IS NULL)
 * Runs retroactively for all MDK clients for a given month/year
 */
export async function createMissingTasks(
  mes: number,
  anio: number
): Promise<{ success: boolean; created: number; error?: string }> {
  const supabase = createClient()

  try {
    // Fetch all instances missing a task where hito genera_tarea = true
    // Only for MDK business unit clients
    const { data: instanciasSinTarea, error } = await supabase
      .from('mapa_servicio_instancias')
      .select(`
        id,
        cliente_id,
        hito_id,
        hito:hitos_catalogo(id, nombre, descripcion, genera_tarea),
        cliente:clientes(id, unidades_negocio, account_manager_id)
      `)
      .eq('mes', mes)
      .eq('anio', anio)
      .is('tarea_id', null)

    if (error) throw error
    if (!instanciasSinTarea || instanciasSinTarea.length === 0) {
      return { success: true, created: 0 }
    }

    // Filter only those where hito.genera_tarea = true AND cliente has MDK in unidades_negocio
    const pendientes = instanciasSinTarea.filter((i) => {
      const hito = i.hito as HitoCatalogo | null
      const cliente = i.cliente as any
      const unidades = cliente?.unidades_negocio as string[] | null
      return hito?.genera_tarea === true && unidades && unidades.includes('MDK')
    })

    let created = 0

    for (const instancia of pendientes) {
      const hito = instancia.hito as HitoCatalogo | null
      const cliente = instancia.cliente as any
      if (!hito || !cliente) continue

      const accountManagerId = cliente.account_manager_id

      const insertPayload = {
        titulo: `[Hito] ${hito.nombre}`,
        descripcion: hito.descripcion || null,
        cliente_id: instancia.cliente_id,
        estado: 'pendiente',
        prioridad: 'media',
        hito_poe: hito.id,
        es_tarea_sistema: true,
        asignado_a: accountManagerId, // Assign to account manager
        asignados_a: accountManagerId ? [accountManagerId] : [], // Array field
      }

      const { data: newTask, error: taskError } = await supabase
        .from('tareas')
        .insert(insertPayload)
        .select('id')
        .single()

      if (taskError || !newTask) {
        console.error('[service-map] Task insert error:', taskError?.message)
        continue
      }

      const { error: updateError } = await supabase
        .from('mapa_servicio_instancias')
        .update({ tarea_id: newTask.id })
        .eq('id', instancia.id)

      if (updateError) {
        console.error('[service-map] Update instance error:', updateError.message)
      }

      created++
    }

    return { success: true, created }
  } catch (error) {
    console.error('[service-map] Error in createMissingTasks:', error)
    return { success: false, created: 0, error: error instanceof Error ? error.message : 'Unknown error' }
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
    // Handle empty string as null for UUID fields
    const completadoPorValue = completadoPor && completadoPor.trim() !== '' ? completadoPor : null

    const { error: updateError } = await supabase
      .from('mapa_servicio_instancias')
      .update({
        estado: 'listo',
        completado_por: completadoPorValue,
        fecha_completado: today,
        checklist_snapshot: checklistSnapshot,
        checklist_completo: checklistCompleto,
        link_drive: linkDrive || null,
      })
      .eq('id', instanciaId)

    if (updateError) throw updateError

    // 3. Mark the linked task as resolved (if the instance has one)
    if (instancia.tarea_id) {
      const { error: taskError } = await supabase
        .from('tareas')
        .update({
          estado: 'resuelto',
          fecha_completada: new Date().toISOString(),
        })
        .eq('id', instancia.tarea_id)

      if (taskError) {
        console.error('[service-map] Error resolving linked task:', taskError.message)
        // Non-critical, don't fail the whole operation
      }
    }

    // 4. Create automatic comment
    const hitoNombre = (instancia.hito as HitoCatalogo)?.nombre || 'Hito'
    const mensaje = checklistCompleto
      ? `Hito completado: ${hitoNombre} - Checklist completo`
      : `Hito cerrado con checklist incompleto: ${hitoNombre}`

    const { error: commentError } = await supabase.from('comentarios_clientes').insert({
      cliente_id: instancia.cliente_id,
      contenido: mensaje,
      colaborador_id: completadoPorValue,
      autor: 'Sistema',
    })

    if (commentError) {
      console.error('[service-map] Error creating comment:', commentError.message)
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
 * Filters by client plan: Esencial only sees 'esencial' hitos, Estratégico sees all
 */
export async function getClientServiceMap(
  clienteId: string,
  mes?: number,
  anio?: number,
  clientPlan?: ClientPlan
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

    // Filter by client plan if provided
    let filteredData = data as MapaServicioInstancia[]
    if (clientPlan && isEsencial(clientPlan)) {
      // Esencial clients only see 'esencial' hitos
      filteredData = filteredData.filter(
        (instance) => (instance.hito as HitoCatalogo)?.tipo_servicio === 'esencial'
      )
    }

    return { data: filteredData }
  } catch (error) {
    console.error('[service-map] Error fetching client service map:', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get aggregated KPIs for service map report
 * Generates instances for clients that don't have them yet
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

    // 1. First fetch ALL active clients that have MDK in unidades_negocio array
    const { data: allClientes, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, plan, project_manager_id, account_manager_id, activo, unidades_negocio')
      .or('activo.is.null,activo.eq.true')
      .contains('unidades_negocio', ['MDK'])
      .order('nombre_del_negocio')

    if (clientesError) throw clientesError
    if (!allClientes || allClientes.length === 0) return { data: [] }

    // 2. Generate instances for each client that doesn't have them yet
    // (only for current month to avoid generating future data)
    const isCurrentMonth = mes === now.getMonth() + 1 && anio === now.getFullYear()
    if (isCurrentMonth) {
      for (const cliente of allClientes) {
        // Check if client already has instances for this month
        const { count } = await supabase
          .from('mapa_servicio_instancias')
          .select('*', { count: 'exact', head: true })
          .eq('cliente_id', cliente.id)
          .eq('mes', mes)
          .eq('anio', anio)

        if (count === 0) {
          // Generate instances for this client
          await generateMonthInstances(cliente.id, mes, anio, cliente.plan || 'Esencial')
        }
      }
    }

    // 3. Now fetch all instances for the month with client data (only MDK clients)
    const { data, error } = await supabase
      .from('mapa_servicio_instancias')
      .select(
        `
        *,
        hito:hitos_catalogo(nombre, tipo_servicio),
        cliente:clientes!inner(id, nombre_del_negocio, plan, project_manager_id, account_manager_id, unidades_negocio)
      `
      )
      .eq('mes', mes)
      .eq('anio', anio)
      .contains('cliente.unidades_negocio', ['MDK'])

    if (error) throw error
    if (!data) return { data: [] }

    // 4. Group by client and calculate KPIs
    const clientMap = new Map<string, ServiceMapKPIs>()

    for (const row of data) {
      const cliente = row.cliente as {
        id: string
        nombre_del_negocio: string
        plan: ClientPlan
        project_manager_id: string | null
        account_manager_id: string | null
      }
      const hito = row.hito as { nombre: string; tipo_servicio: string } | null

      if (!cliente) continue

      // Filter instances by client plan (Esencial only sees esencial hitos)
      if (isEsencial(cliente.plan) && hito?.tipo_servicio !== 'esencial') continue

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
          noRealizados: 0,
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
          kpi.ultimoHito = hito?.nombre || null
        }
      } else if (row.estado === 'no_realizado') {
        kpi.noRealizados++
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

// ── MDK Removal & Month Close Functions ───────────────────────────────────────

/**
 * Cleanup service map when MDK is removed from a client's unidades_negocio
 * - Marks pending/in_course instances as 'no_realizado' (preserves history)
 * - Cancels/deletes pending hito tasks
 * - Does NOT delete completed instances (history preserved)
 */
export async function cleanupServiceMapOnMDKRemoval(
  clienteId: string
): Promise<{ success: boolean; error?: string; instancesMarked?: number; tasksCancelled?: number }> {
  const supabase = createClient()

  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // 1. Get all pending/in_course instances for current month and future
    const { data: instancias, error: fetchError } = await supabase
      .from('mapa_servicio_instancias')
      .select('id, tarea_id, estado')
      .eq('cliente_id', clienteId)
      .in('estado', ['pendiente', 'en_curso'])
      .or(`anio.gt.${currentYear},and(anio.eq.${currentYear},mes.gte.${currentMonth})`)

    if (fetchError) throw fetchError

    if (!instancias || instancias.length === 0) {
      return { success: true, instancesMarked: 0, tasksCancelled: 0 }
    }

    // 2. Mark instances as 'no_realizado'
    const instanceIds = instancias.map((i) => i.id)
    const { error: updateError } = await supabase
      .from('mapa_servicio_instancias')
      .update({ estado: 'no_realizado' })
      .in('id', instanceIds)

    if (updateError) throw updateError

    // 3. Get task IDs to cancel (only those that exist)
    const taskIds = instancias.map((i) => i.tarea_id).filter((id): id is string => id !== null)

    let tasksCancelled = 0
    if (taskIds.length > 0) {
      // Delete pending hito tasks (only pendiente status)
      const { data: deletedTasks, error: deleteTaskError } = await supabase
        .from('tareas')
        .delete()
        .in('id', taskIds)
        .eq('estado', 'pendiente')
        .select('id')

      if (deleteTaskError) {
        console.error('[service-map] Error deleting tasks:', deleteTaskError.message)
        // Non-critical, continue
      } else {
        tasksCancelled = deletedTasks?.length || 0
      }
    }

    // 4. Create comment documenting the cleanup
    const { error: commentError } = await supabase.from('comentarios_clientes').insert({
      cliente_id: clienteId,
      contenido: `Mapa de servicio desactivado: ${instancias.length} hitos marcados como no realizados, ${tasksCancelled} tareas canceladas. Motivo: Cliente removido de unidad MDK.`,
      tipo: 'sistema',
      autor: 'Sistema',
    })

    if (commentError) {
      console.error('[service-map] Error creating cleanup comment:', commentError.message)
    }

    return { success: true, instancesMarked: instancias.length, tasksCancelled }
  } catch (error) {
    console.error('[service-map] Error in cleanupServiceMapOnMDKRemoval:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Close a month's service map for all MDK clients
 * - Marks all pending/in_course instances as 'no_realizado'
 * - Cancels associated pending tasks
 * - Creates summary comment per client
 * Should be called via cron on the 1st of each month for the previous month
 */
export async function closeMonthServiceMap(
  mes: number,
  anio: number
): Promise<{ success: boolean; clientsClosed: number; instancesClosed: number; error?: string }> {
  const supabase = createClient()

  try {
    // 1. Get all pending/in_course instances for the specified month
    const { data: instancias, error: fetchError } = await supabase
      .from('mapa_servicio_instancias')
      .select(`
        id,
        cliente_id,
        tarea_id,
        estado,
        hito:hitos_catalogo(nombre)
      `)
      .eq('mes', mes)
      .eq('anio', anio)
      .in('estado', ['pendiente', 'en_curso'])

    if (fetchError) throw fetchError

    if (!instancias || instancias.length === 0) {
      return { success: true, clientsClosed: 0, instancesClosed: 0 }
    }

    // 2. Group by client for summary
    const clientInstances = new Map<string, Array<{ id: string; tarea_id: string | null; hitoNombre: string }>>()
    
    for (const inst of instancias) {
      const hito = inst.hito as { nombre: string } | null
      const clientList = clientInstances.get(inst.cliente_id) || []
      clientList.push({
        id: inst.id,
        tarea_id: inst.tarea_id,
        hitoNombre: hito?.nombre || 'Hito desconocido',
      })
      clientInstances.set(inst.cliente_id, clientList)
    }

    // 3. Mark all instances as 'no_realizado'
    const instanceIds = instancias.map((i) => i.id)
    const { error: updateError } = await supabase
      .from('mapa_servicio_instancias')
      .update({ estado: 'no_realizado' })
      .in('id', instanceIds)

    if (updateError) throw updateError

    // 4. Cancel/delete pending tasks
    const taskIds = instancias.map((i) => i.tarea_id).filter((id): id is string => id !== null)
    
    if (taskIds.length > 0) {
      const { error: deleteTaskError } = await supabase
        .from('tareas')
        .delete()
        .in('id', taskIds)
        .eq('estado', 'pendiente')

      if (deleteTaskError) {
        console.error('[service-map] Error deleting tasks on month close:', deleteTaskError.message)
      }
    }

    // 5. Create summary comment for each client
    const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    
    for (const [clienteId, clientInsts] of clientInstances) {
      const hitosNoRealizados = clientInsts.map((i) => i.hitoNombre).join(', ')
      
      await supabase.from('comentarios_clientes').insert({
        cliente_id: clienteId,
        contenido: `Cierre de mes ${monthNames[mes]} ${anio}: ${clientInsts.length} hitos no realizados - ${hitosNoRealizados}`,
        tipo: 'cierre_mes',
        autor: 'Sistema',
      })
    }

    return {
      success: true,
      clientsClosed: clientInstances.size,
      instancesClosed: instancias.length,
    }
  } catch (error) {
    console.error('[service-map] Error in closeMonthServiceMap:', error)
    return { success: false, clientsClosed: 0, instancesClosed: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

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
