'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateClientPlatformIds(
  clientId: string,
  metaAdsAccountId: string | null | undefined,
  googleAdsCustomerId: string | null | undefined,
  crmType?: string | null,
  ghlLocationId?: string | null,
  ghlToken?: string | null,
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('rol_id')
    .eq('id', user.id)
    .single()

  // TODO: Check rol_id for access control
  if (!colaborador) {
    return { error: 'Sin permiso' }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (metaAdsAccountId !== undefined) updates.meta_ads_account_id = metaAdsAccountId || null
  if (googleAdsCustomerId !== undefined) updates.google_ads_customer_id = googleAdsCustomerId || null
  if (crmType !== undefined) updates.crm_type = crmType || null
  if (ghlLocationId !== undefined) updates.ghl_location_id = ghlLocationId || null
  if (ghlToken !== undefined) updates.ghl_token = ghlToken || null

  const { error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', clientId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/clients/config')
  return { success: true }
}

export async function replaceClientCrmAccounts(clientId: string, accountIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: colaborador } = await supabase.from('colaboradores').select('rol_id').eq('id', user.id).single()
  if (!colaborador) return { error: 'Sin permiso' }
  const normalized = [...new Set(accountIds.map(id => id.trim()).filter(Boolean))]
  const { error: deleteError } = await supabase.from('client_crm_accounts').delete().eq('client_id', clientId).eq('crm_type', 'aurelia')
  if (deleteError) return { error: deleteError.message }
  if (normalized.length) {
    const { error: insertError } = await supabase.from('client_crm_accounts').insert(normalized.map(crmAccountId => ({ client_id: clientId, crm_type: 'aurelia', crm_account_id: crmAccountId, active: true })))
    if (insertError) return { error: insertError.message }
  }
  revalidatePath('/dashboard/platform')
  return { success: true }
}
