'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateClientPlatformIds(
  clientId: string,
  metaAdsAccountId: string | null | undefined,
  googleAdsCustomerId: string | null | undefined,
  crmType?: string | null,
  ghlLocationId?: string | null,
  ghlToken?: string | null,
  analyticsPropertyId?: string | null,
  tagManagerContainerId?: string | null,
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
  if (ghlLocationId !== undefined) {
    const normalizedCrmAccountId = ghlLocationId?.trim() || null
    updates.ghl_location_id = normalizedCrmAccountId
    if (crmType === 'aurelia') updates.crm_location_id = normalizedCrmAccountId
  }
  if (ghlToken !== undefined) updates.ghl_token = ghlToken || null
  if (analyticsPropertyId !== undefined) updates.analytics_property_id = analyticsPropertyId || null
  if (tagManagerContainerId !== undefined) updates.tag_manager_container_id = tagManagerContainerId || null

  const { error } = await supabase
    .from('clientes')
    .update(updates)
    .eq('id', clientId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/clients/config')
  return { success: true }
}

export async function getClientCrmAccounts(clientIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', accounts: {} as Record<string, string[]> }
  const { data: colaborador } = await supabase.from('colaboradores').select('rol_id').eq('id', user.id).single()
  if (!colaborador) return { error: 'Sin permiso', accounts: {} as Record<string, string[]> }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_crm_accounts')
    .select('client_id, crm_account_id')
    .eq('crm_type', 'aurelia')
    .eq('active', true)
    .in('client_id', clientIds)
  if (error) return { error: error.message, accounts: {} as Record<string, string[]> }
  const accounts = (data ?? []).reduce<Record<string, string[]>>((result, row) => {
    result[row.client_id] = [...(result[row.client_id] ?? []), row.crm_account_id]
    return result
  }, {})
  return { accounts }
}

export async function replaceClientCrmAccounts(clientId: string, accountIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: colaborador } = await supabase.from('colaboradores').select('rol_id').eq('id', user.id).single()
  if (!colaborador) return { error: 'Sin permiso' }
  const normalized = [...new Set(accountIds.map(id => id.trim()).filter(Boolean))]
  const admin = createAdminClient()
  const { error: deleteError } = await admin.from('client_crm_accounts').delete().eq('client_id', clientId).eq('crm_type', 'aurelia')
  if (deleteError) return { error: deleteError.message }
  if (normalized.length) {
    const { error: insertError } = await admin.from('client_crm_accounts').insert(normalized.map(crmAccountId => ({ client_id: clientId, crm_type: 'aurelia', crm_account_id: crmAccountId, active: true })))
    if (insertError) return { error: insertError.message }
  }
  revalidatePath('/dashboard/platform')
  return { success: true }
}
