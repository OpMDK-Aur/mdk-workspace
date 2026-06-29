import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

interface ResultadoFallido {
  nombre: string
  tipo: 'meta_form' | 'landing'
  detalle: string | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { cliente_id, resultados_fallidos } = await req.json() as {
      cliente_id: string
      resultados_fallidos: ResultadoFallido[]
    }

    if (!cliente_id || !resultados_fallidos || resultados_fallidos.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get client info
    const { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', cliente_id)
      .single()

    if (!cliente) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Find testing task type
    const { data: tipoTarea } = await supabase
      .from('tipo_de_tareas')
      .select('id')
      .ilike('nombre', '%testing%integración%')
      .limit(1)
      .single()

    // Find Erika Gordillo to assign the task
    const { data: erika } = await supabase
      .from('colaboradores')
      .select('id')
      .ilike('nombre', '%erika%')
      .ilike('apellido', '%gordillo%')
      .limit(1)
      .single()

    // Build description with failed results
    const failureDetails = resultados_fallidos
      .map((r, idx) => `
<tr>
  <td style="padding: 8px; border: 1px solid #e5e7eb;">${idx + 1}</td>
  <td style="padding: 8px; border: 1px solid #e5e7eb;">${r.nombre}</td>
  <td style="padding: 8px; border: 1px solid #e5e7eb;">${r.tipo === 'meta_form' ? 'Formulario Meta' : 'Landing'}</td>
  <td style="padding: 8px; border: 1px solid #e5e7eb;">${r.detalle || 'Sin detalles'}</td>
</tr>
      `)
      .join('')

    const descripcion = `
<h2>Fallos detectados en testing - ${cliente.nombre_del_negocio}</h2>

<p>Se encontraron los siguientes fallos durante la ejecución automática de tests:</p>

<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
  <thead>
    <tr style="background-color: #f3f4f6;">
      <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">#</th>
      <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Elemento</th>
      <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Tipo</th>
      <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Detalle del error</th>
    </tr>
  </thead>
  <tbody>
    ${failureDetails}
  </tbody>
</table>

<p><strong>Acción requerida:</strong> Revisar y corregir los formularios y landings indicados.</p>
    `.trim()

    // Create task - assign to Erika Gordillo, created by current user
    const asignadoA = erika?.id || user.id // Fallback to current user if Erika not found
    const asignadosA = [asignadoA]
    if (cliente.account_manager_ids && !cliente.account_manager_ids.includes(asignadoA)) {
      asignadosA.push(...cliente.account_manager_ids)
    }

    const { data: tarea } = await supabase
      .from('tareas')
      .insert({
        titulo: `[Tester] Fallo de integración — ${cliente.nombre_del_negocio}`,
        descripcion,
        cliente_ids: [cliente_id],
        tipo_tarea_id: tipoTarea?.id || null,
        asignado_a: asignadoA,
        asignados_a: asignadosA,
        prioridad: 'alta',
        estado: 'pendiente',
        creado_por: user.id
      })
      .select()
      .single()

    if (!tarea) {
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    // Add system comment with tested forms/landings
    const testedFormsText = resultados_fallidos
      .map(r => `• **${r.nombre}** (${r.tipo === 'meta_form' ? 'Formulario Meta' : 'Landing'})`)
      .join('\n')

    const comentario = `**Testing automático ejecutado**\n\nFormularios/Landings testeados:\n${testedFormsText}`

    await supabase
      .from('comentarios_tareas')
      .insert({
        id: crypto.randomUUID(),
        tarea_id: tarea.id,
        contenido: comentario,
        autor_id: null,
        autor_nombre: 'Madky',
        es_sistema: true
      })

    return NextResponse.json({ tarea, message: 'Tarea generada exitosamente' })
  } catch (error) {
    console.error('Error generating task:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
