import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json()
  const { cliente_id } = body

  if (!cliente_id) {
    return NextResponse.json(
      { error: 'cliente_id is required' },
      { status: 400 }
    )
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const supabase = createAdminClient()

    // Buscar el hito "Testing de Integración" para este cliente
    const { data: tareas, error: getTareasError } = await supabase
      .from('tareas')
      .select('id, titulo, estado')
      .contains('cliente_ids', [cliente_id])
      .ilike('titulo', '%Testing de Integración%')
      .limit(1)

    if (getTareasError) {
      console.error('[Mark Hito Complete] Error fetching tarea:', getTareasError)
      throw getTareasError
    }

    if (!tareas || tareas.length === 0) {
      return NextResponse.json(
        { 
          success: false,
          message: 'No se encontró el hito "Testing de Integración" para este cliente'
        },
        { status: 404 }
      )
    }

    const hito = tareas[0]
    
    // Actualizar el estado del hito a "completado"
    const { error: updateError } = await supabase
      .from('tareas')
      .update({ estado: 'completado' })
      .eq('id', hito.id)

    if (updateError) {
      console.error('[Mark Hito Complete] Error updating tarea:', updateError)
      throw updateError
    }

    console.log('[Mark Hito Complete] Hito marcado como completado:', hito.id)

    return NextResponse.json({
      success: true,
      message: 'Hito marcado como completado',
      hito_id: hito.id
    })
  } catch (error) {
    console.error('[Mark Hito Complete] Error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Error interno del servidor'
      },
      { status: 500 }
    )
  }
}
