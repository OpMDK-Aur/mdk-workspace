import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getAdminClient()
  
  // Count all tasks with [Hito] prefix
  const { data: hitoByTitle, error: err1 } = await supabase
    .from('tareas')
    .select('id, titulo, fecha_vencimiento, hito_poe')
    .ilike('titulo', '[Hito]%')
    .limit(20)
  
  // Count all tasks with hito_poe
  const { data: hitoByPoe, error: err2 } = await supabase
    .from('tareas')
    .select('id, titulo, fecha_vencimiento, hito_poe')
    .not('hito_poe', 'is', null)
    .limit(20)
  
  // Count total with either condition
  const { count: totalHitoTitle } = await supabase
    .from('tareas')
    .select('*', { count: 'exact', head: true })
    .ilike('titulo', '[Hito]%')
  
  const { count: totalHitoPoe } = await supabase
    .from('tareas')
    .select('*', { count: 'exact', head: true })
    .not('hito_poe', 'is', null)
  
  // Check tasks without fecha_vencimiento
  const { data: noFecha, count: countNoFecha } = await supabase
    .from('tareas')
    .select('id, titulo, fecha_vencimiento', { count: 'exact' })
    .or('hito_poe.not.is.null,titulo.ilike.[Hito]%')
    .is('fecha_vencimiento', null)
    .limit(10)
  
  return NextResponse.json({
    totalByTitle: totalHitoTitle,
    totalByPoe: totalHitoPoe,
    sampleByTitle: hitoByTitle?.slice(0, 5),
    sampleByPoe: hitoByPoe?.slice(0, 5),
    withoutFecha: {
      count: countNoFecha,
      sample: noFecha
    },
    errors: { err1, err2 }
  })
}
