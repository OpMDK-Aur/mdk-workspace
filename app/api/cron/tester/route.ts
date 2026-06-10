import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()

  try {
    // Verify CRON_SECRET from Authorization header
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const isManual = searchParams.get('manual') === 'true'

    // Get cron configuration from agentes_config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'tester')
      .single()

    if (!agentConfig) {
      return NextResponse.json({ error: 'Agent not configured' }, { status: 404 })
    }

    const parametros = agentConfig.parametros as Record<string, any>
    const clientesIncluidos = parametros?.clientes_incluidos || []

    // Get active clients with Meta Ads account
    const query = supabase
      .from('clientes')
      .select('*')
      .eq('activo', true)
      .not('meta_ads_account_id', 'is', null)

    const { data: clientes } = clientesIncluidos.length > 0
      ? await query.in('id', clientesIncluidos)
      : await query

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({
        clientes_testeados: 0,
        formularios_ok: 0,
        formularios_fallidos: 0,
        tareas_generadas: 0
      })
    }

    let totalOk = 0
    let totalFailed = 0
    let tasksGenerated = 0

    // Process each client
    for (const cliente of clientes) {
      try {
        // Mock: Simulate test execution for each client
        // In production, this would call the actual test APIs

        // For now, just log the execution
        await supabase.from('agentes_log').insert({
          agente: 'tester',
          clientes_auditados: 1,
          alertas_generadas: 0,
          estado: 'ok'
        })
      } catch (error) {
        console.error(`Error testing client ${cliente.id}:`, error)
      }
    }

    return NextResponse.json({
      clientes_testeados: clientes.length,
      formularios_ok: totalOk,
      formularios_fallidos: totalFailed,
      tareas_generadas: tasksGenerated
    })
  } catch (error) {
    console.error('Error in tester cron:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
