import type { SupabaseClient } from '@supabase/supabase-js'

type Platform = 'meta' | 'google'

export async function updateAdvertisingAccountName(
  supabase: SupabaseClient,
  input: { clienteId: string; plataforma: Platform; idCuenta: string; nombreCuenta: string },
) {
  const ids = input.plataforma === 'meta'
    ? [input.idCuenta, input.idCuenta.replace(/^act_/, ''), `act_${input.idCuenta.replace(/^act_/, '')}`]
    : [input.idCuenta, input.idCuenta.replace(/-/g, '')]

  const { data, error } = await supabase
    .from('cuentas_publicitarias')
    .update({ nombre_cuenta: input.nombreCuenta })
    .eq('cliente_id', input.clienteId)
    .eq('plataforma', input.plataforma)
    .in('id_cuenta', [...new Set(ids)])
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}
