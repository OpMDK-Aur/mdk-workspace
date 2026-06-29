import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Cron job to auto-fill NPS with "No responde" for clients without NPS score
 * Runs on the last day of each month at 23:00 UTC
 * Only processes active clients with encuesta_enviada=true and specific servicios
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Check if today is the last day of the current month
    const today = new Date()
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    
    if (today.getDate() !== lastDayOfMonth.getDate()) {
      console.log('[nps-autofill] Not the last day of month, skipping')
      return NextResponse.json({ 
        message: 'Not the last day of month',
        today: today.toISOString(),
        lastDay: lastDayOfMonth.toISOString()
      })
    }

    console.log('[nps-autofill] Running on last day of month:', today.toISOString())

    // Fetch clients that meet criteria:
    // - activo = true (from clientes table)
    // - encuesta_enviada = true (from cliente_nps_historial table)
    // - servicios_contratados contains "generacion-de-demanda" OR "consultoria"
    // - nps_score IS NULL (no score yet in clientes table)
    
    // First, get all clients with encuesta_enviada = true from cliente_nps_historial
    const { data: npsHistorial, error: npsError } = await supabase
      .from('cliente_nps_historial')
      .select('cliente_id')
      .eq('encuesta_enviada', true)
      .limit(1000) // Set a reasonable limit

    if (npsError) {
      console.error('[nps-autofill] Error fetching NPS historial:', npsError)
      return NextResponse.json({ error: npsError.message }, { status: 500 })
    }

    const clientIdsWithEncuesta = npsHistorial?.map((r: any) => r.cliente_id) || []
    console.log('[nps-autofill] Found', clientIdsWithEncuesta.length, 'clients with encuesta_enviada = true')

    if (clientIdsWithEncuesta.length === 0) {
      console.log('[nps-autofill] No clients with encuesta_enviada, exiting')
      return NextResponse.json({
        success: true,
        message: 'No clients found with encuesta_enviada = true',
        recordsCreated: 0,
      })
    }

    // Now fetch the client details for those with encuesta_enviada = true
    const { data: clients, error: clientsError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, activo, servicios_contratados, nps_score')
      .eq('activo', true)
      .is('nps_score', null)
      .in('id', clientIdsWithEncuesta)

    if (clientsError) {
      console.error('[nps-autofill] Error fetching clients:', clientsError)
      return NextResponse.json({ error: clientsError.message }, { status: 500 })
    }

    console.log('[nps-autofill] Found', clients?.length || 0, 'active clients with encuesta_enviada and no NPS score')

    // Filter clients that have the correct servicios
    const serviciosToMatch = ['generacion-de-demanda', 'consultoria']
    const clientesToProcess = clients?.filter((client: any) => {
      if (!client.servicios_contratados) return false
      const servicios = client.servicios_contratados
      return servicios.some((s: any) => {
        const servicioId = typeof s === 'string' ? s : s.id || s.servicio_id
        return serviciosToMatch.some(match => 
          servicioId && servicioId.toLowerCase().includes(match)
        )
      })
    }) || []

    console.log('[nps-autofill] Clients with matching servicios:', clientesToProcess.length)

    // Get current month start and end dates for idempotence check
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = lastDayOfMonth

    // For each client, create an NPS record with "No responde"
    let createdCount = 0
    const errors = []

    for (const client of clientesToProcess) {
      try {
        // Check if this client already has an NPS record this month
        const { data: existingRecord } = await supabase
          .from('cliente_nps_historial')
          .select('id')
          .eq('cliente_id', client.id)
          .gte('fecha', monthStart.toISOString().split('T')[0])
          .lte('fecha', monthEnd.toISOString().split('T')[0])
          .limit(1)

        if (existingRecord && existingRecord.length > 0) {
          console.log('[nps-autofill] Client', client.id, 'already has NPS record this month, skipping')
          continue
        }

        // Create NPS record with "No responde"
        const { error: insertError } = await supabase
          .from('cliente_nps_historial')
          .insert({
            cliente_id: client.id,
            score: null, // No score for "No responde"
            comentario: 'No responde',
            fecha: lastDayOfMonth.toISOString().split('T')[0],
            encuestado_nombre: null,
            encuestado_cargo: null,
          })

        if (insertError) {
          errors.push({ clientId: client.id, error: insertError.message })
          console.error('[nps-autofill] Error creating NPS record for client', client.id, ':', insertError)
        } else {
          createdCount++
          console.log('[nps-autofill] Created NPS record for client:', client.id, client.nombre_del_negocio)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        errors.push({ clientId: client.id, error: errorMsg })
        console.error('[nps-autofill] Exception for client', client.id, ':', err)
      }
    }

    console.log('[nps-autofill] Completed. Created:', createdCount, 'records. Errors:', errors.length)

    return NextResponse.json({
      success: true,
      message: `NPS autofill completed. Created ${createdCount} records.`,
      clientsProcessed: clientesToProcess.length,
      recordsCreated: createdCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[nps-autofill] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
