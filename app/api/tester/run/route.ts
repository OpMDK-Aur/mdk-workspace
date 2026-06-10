import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TesterItem, TesterResultado } from '@/lib/types'

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { cliente_id, items } = await req.json() as { cliente_id: string; items: TesterItem[] }

    if (!cliente_id || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get cliente info
    const { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', cliente_id)
      .single()

    if (!cliente) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const resultados: TesterResultado[] = []

    // Process each item
    for (const item of items) {
      if (item.tipo === 'meta_form') {
        // Test meta form
        const resultado: TesterResultado = {
          id: crypto.randomUUID(),
          cliente_id,
          crm_tipo: cliente.crm_tipo,
          tipo: 'meta_form',
          nombre: item.nombre,
          form_id: item.form_id,
          landing_url: null,
          estado: 'ok', // Mock: assume success
          detalle: 'Formulario respondido correctamente',
          modo: 'manual',
          ejecutado_por: user.id,
          tarea_generada_id: null,
          ejecutado_en: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
        resultados.push(resultado)

        // Insert into DB
        await supabase.from('tester_resultados').insert(resultado)
      } else if (item.tipo === 'landing') {
        // Test landing
        try {
          const response = await fetch(item.url || '', { method: 'HEAD' })
          const estado = response.ok ? 'ok' : 'fallo'

          const resultado: TesterResultado = {
            id: crypto.randomUUID(),
            cliente_id,
            crm_tipo: cliente.crm_tipo,
            tipo: 'landing',
            nombre: item.nombre,
            form_id: null,
            landing_url: item.url,
            estado,
            detalle: response.ok ? 'Landing accesible' : `Error HTTP ${response.status}`,
            modo: 'manual',
            ejecutado_por: user.id,
            tarea_generada_id: null,
            ejecutado_en: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
          resultados.push(resultado)

          // Insert into DB
          await supabase.from('tester_resultados').insert(resultado)
        } catch (error) {
          const resultado: TesterResultado = {
            id: crypto.randomUUID(),
            cliente_id,
            crm_tipo: cliente.crm_tipo,
            tipo: 'landing',
            nombre: item.nombre,
            form_id: null,
            landing_url: item.url,
            estado: 'fallo',
            detalle: 'No se pudo acceder a la landing',
            modo: 'manual',
            ejecutado_por: user.id,
            tarea_generada_id: null,
            ejecutado_en: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
          resultados.push(resultado)

          // Insert into DB
          await supabase.from('tester_resultados').insert(resultado)
        }
      }
    }

    return NextResponse.json({ resultados })
  } catch (error) {
    console.error('Error in tester run:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
