import type { SupabaseClient } from '@supabase/supabase-js'

type Platform = 'meta' | 'google'

export async function updateAdvertisingAccountName(
  supabase: SupabaseClient,
  input: { clienteId: string; plataforma: Platform; idCuenta: string; nombreCuenta: string },
): Promise<'created' | 'updated' | 'unchanged'> {
  const ids = input.plataforma === 'meta'
    ? [input.idCuenta, input.idCuenta.replace(/^act_/, ''), `act_${input.idCuenta.replace(/^act_/, '')}`]
    : [input.idCuenta, input.idCuenta.replace(/-/g, '')]
  const normalizedIds = [...new Set(ids)]
  const { data: existing, error: findError } = await supabase.from('cuentas_publicitarias').select('id, nombre_cuenta').eq('cliente_id', input.clienteId).eq('plataforma', input.plataforma).in('id_cuenta', normalizedIds).limit(1)
  if (findError) throw findError
  if (existing?.[0]) {
    if (existing[0].nombre_cuenta === input.nombreCuenta) return 'unchanged'
    const { error } = await supabase.from('cuentas_publicitarias').update({ nombre_cuenta: input.nombreCuenta }).eq('id', existing[0].id)
    if (error) throw error
    return 'updated'
  }
  const { error } = await supabase.from('cuentas_publicitarias').insert({ cliente_id: input.clienteId, plataforma: input.plataforma, id_cuenta: input.idCuenta, nombre_cuenta: input.nombreCuenta })
  if (error) throw error
  return 'created'
}
