import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get colaborador_id from user email
    const { data: colaborador } = await supabase
      .from('colaboradores')
      .select('id')
      .eq('email', user.email)
      .single()
    
    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador not found' }, { status: 404 })
    }

    const body = await request.json()
    const { titulo, fecha } = body

    if (!titulo?.trim()) {
      return NextResponse.json({ error: 'Titulo required' }, { status: 400 })
    }

    const fechaTexto = fecha
      ? new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null

    const { error } = await supabase.from('notificaciones').insert({
      colaborador_id: colaborador.id,
      tipo: 'tarea_vence',
      titulo: titulo.trim(),
      descripcion: fechaTexto ? `Recordatorio para el ${fechaTexto}` : 'Recordatorio sin fecha',
      referencia_id: null,
      referencia_tipo: null,
      leida: false,
    })

    if (error) {
      console.error('[v0] Error creating reminder:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
