import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FacturacionModule, type FacturacionRow } from '@/components/dashboard/facturacion-module'

export const metadata = {
  title: 'Facturación · MDK Workspace',
  description: 'Resumen y detalle de facturación por cliente y unidad de negocio',
}

export default async function FacturacionPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase
    .from('facturacion')
    .select(
      `
      id,
      cliente_id,
      cliente_nombre_raw,
      unidad_de_negocio_id,
      tipo_fee,
      concepto,
      monto_sin_iva,
      monto_con_iva,
      estado_emision,
      estado_cobro,
      tipo_cliente,
      mes,
      anio,
      clientes(nombre_del_negocio),
      unidad_de_negocio(nombre)
    `,
    )
    .order('mes', { ascending: false })

  const rows = (data ?? []) as unknown as FacturacionRow[]

  return <FacturacionModule rows={rows} />
}
