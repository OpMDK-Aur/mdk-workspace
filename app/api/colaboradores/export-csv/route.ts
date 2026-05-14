import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Check access permissions
  const { data: colab } = await supabase
    .from('colaboradores')
    .select('email')
    .eq('id', user.id)
    .single()

  const allowedEmails = ['operaciones@madketing.io', 'direccion@madketing.io']
  if (!colab?.email || !allowedEmails.includes(colab.email)) {
    return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 })
  }

  // Get query params
  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') || String(new Date().getMonth() + 1)
  const anio = searchParams.get('anio') || String(new Date().getFullYear())

  // Fetch metricas with relations
  const { data: metricas, error } = await supabase
    .from('metricas_colaboradores')
    .select(`
      *,
      colaborador:colaborador_id(id, nombre, apellido, email, rol_id, roles(id, nombre)),
      cliente:cliente_id(id, nombre_del_negocio, fee_mdk, fee_aurelia, fee_consultoria)
    `)
    .eq('mes', parseInt(mes))
    .eq('anio', parseInt(anio))
    .order('created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build CSV
  const headers = [
    'Colaborador',
    'Email',
    'Rol',
    'Cliente',
    'Fee Administrado',
    'Valor Hora',
    'Horas Teoricas',
    'Minimo No Negociable',
    'Horas Objetivo',
    'Acumulado Mes',
    'Porcentaje Asignacion',
    'Mes',
    'Año'
  ]

  const rows = metricas.map((m: any) => {
    const colaborador = m.colaborador
    const cliente = m.cliente
    const nombreCompleto = colaborador 
      ? `${colaborador.nombre || ''} ${colaborador.apellido || ''}`.trim()
      : 'Sin asignar'
    const rolNombre = colaborador?.roles?.nombre || ''
    
    return [
      nombreCompleto,
      colaborador?.email || '',
      rolNombre,
      cliente?.nombre_del_negocio || '',
      m.fee_administrado || 0,
      m.valor_hora || 0,
      m.horas_teoricas_cliente || 0,
      m.minimo_no_negociable_horas || 0,
      m.horas_objetivo || 0,
      m.acumulado_mes_asignado || 0,
      m.porcentaje_asignacion || 0,
      m.mes,
      m.anio
    ]
  })

  // Escape CSV values
  const escapeCSV = (value: any): string => {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n')

  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF'
  const csvWithBOM = BOM + csvContent

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]
  const filename = `colaboradores_${months[parseInt(mes) - 1]}_${anio}.csv`

  return new NextResponse(csvWithBOM, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
