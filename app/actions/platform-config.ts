'use server'
import { parsePageIds, serializePageIds } from '@/lib/meta-ads/page-ids'

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
    const normalizedCrmAccountId = typeof ghlLocationId === 'string' ? ghlLocationId.trim() || null : null
    updates.crm_location_id = normalizedCrmAccountId
    updates.ghl_location_id = normalizedCrmAccountId
  }
  if (ghlToken !== undefined) updates.ghl_token = ghlToken || null
  if (analyticsPropertyId !== undefined) updates.analytics_property_id = analyticsPropertyId || null
  if (tagManagerContainerId !== undefined) updates.tag_manager_container_id = tagManagerContainerId || null

  const admin = createAdminClient()
  const { data: updatedClient, error } = await admin
    .from('clientes')
    .update(updates)
    .eq('id', clientId)
    .select('id, crm_type, crm_location_id, ghl_location_id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updatedClient) return { error: 'No se actualizó el cliente: no se encontró el ID del cliente o la fila no es accesible.' }

  const accountKey = (account: { plataforma: string; id_cuenta: string }) => `${account.plataforma}:${account.id_cuenta}`
  const desiredByKey = new Map(
    [
      ...splitAccountIds(metaAdsAccountId).map((id) => ({ plataforma: 'meta', id_cuenta: id })),
      ...splitAccountIds(googleAdsCustomerId).map((id) => ({ plataforma: 'google', id_cuenta: id })),
    ].map((account) => [accountKey(account), account]),
  )
  // Solo se sincronizan las plataformas que vinieron en esta llamada (undefined = no tocar).
  const syncedPlatforms = [
    ...(metaAdsAccountId !== undefined ? ['meta'] : []),
    ...(googleAdsCustomerId !== undefined ? ['google'] : []),
  ]

  let warning: string | undefined
  if (syncedPlatforms.length) {
    const { data: existingAccounts, error: existingAccountsError } = await admin
      .from('cuentas_publicitarias')
      .select('id, plataforma, id_cuenta')
      .eq('cliente_id', clientId)
      .in('plataforma', syncedPlatforms)
    if (existingAccountsError) return { error: existingAccountsError.message }

    const existingKeys = new Set((existingAccounts ?? []).map((account) => accountKey(account)))
    const staleIds = (existingAccounts ?? []).filter((account) => !desiredByKey.has(accountKey(account))).map((account) => account.id)
    if (staleIds.length) {
      const { error: deleteError } = await admin.from('cuentas_publicitarias').delete().in('id', staleIds)
      if (deleteError) return { error: deleteError.message }
    }

    const missing = [...desiredByKey.values()].filter((account) => !existingKeys.has(accountKey(account)))
    if (missing.length) {
      // `cuentas_publicitarias` es única por plataforma + id_cuenta en toda la base:
      // una cuenta ya vinculada a otro cliente no se puede insertar acá.
      const { data: takenRows, error: takenError } = await admin
        .from('cuentas_publicitarias')
        .select('plataforma, id_cuenta, cliente_id')
        .in('id_cuenta', missing.map((account) => account.id_cuenta))
        .neq('cliente_id', clientId)
      if (takenError) return { error: takenError.message }
      const taken = (takenRows ?? []).filter((row) => desiredByKey.has(accountKey(row)))
      const takenKeys = new Set(taken.map((row) => accountKey(row)))
      const toInsert = missing.filter((account) => !takenKeys.has(accountKey(account)))

      if (toInsert.length) {
        const { error: insertError } = await admin.from('cuentas_publicitarias').insert(
          toInsert.map((account) => ({ cliente_id: clientId, plataforma: account.plataforma, id_cuenta: account.id_cuenta, nombre_cuenta: account.id_cuenta, activo: true })),
        )
        if (insertError) return { error: insertError.message }
      }

      if (taken.length) {
        const ownerIds = [...new Set(taken.map((row) => row.cliente_id).filter(Boolean))]
        const { data: owners } = ownerIds.length
          ? await admin.from('clientes').select('id, nombre_del_negocio').in('id', ownerIds)
          : { data: [] as Array<{ id: string; nombre_del_negocio: string | null }> }
        const ownerName = new Map((owners ?? []).map((owner) => [owner.id, owner.nombre_del_negocio ?? 'otro cliente']))
        const detail = taken
          .map((row) => `${row.plataforma === 'meta' ? 'Meta' : 'Google Ads'} ${row.id_cuenta} (ya está en ${ownerName.get(row.cliente_id) ?? 'otro cliente'})`)
          .join(', ')
        warning = `Se guardó el resto de la configuración, pero estas cuentas no se vincularon porque ya pertenecen a otro cliente: ${detail}.`
      }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/clients/config')
  return { success: true, warning }
}

function splitAccountIds(value: string | null | undefined) {
  return [...new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean))]
}

export async function updateClientMetaPage(clientId: string, pageId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: colaborador } = await supabase.from('colaboradores').select('rol_id').eq('id', user.id).single()
  if (!colaborador) return { error: 'Sin permiso' }

  const ids = parsePageIds(pageId)
  if (ids.some((id) => !/^\d+$/.test(id))) return { error: 'ID de página inválido' }
  const normalized = serializePageIds(ids)

  const admin = createAdminClient()
  const { error } = await admin
    .from('clientes')
    .update({ meta_page_id: normalized, updated_at: new Date().toISOString() })
    .eq('id', clientId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/clients/config')
  return { success: true }
}

export async function saveClientAureliaAccount(clientId: string, accountId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: colaborador } = await supabase.from('colaboradores').select('rol_id').eq('id', user.id).single()
  if (!colaborador) return { error: 'Sin permiso' }
  const normalized = accountId?.trim() || null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clientes')
    .update({ crm_location_id: normalized, ghl_location_id: normalized, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select('id, crm_location_id, ghl_location_id')
    .single()
  if (error) return { error: error.message }
  if (!data) return { error: 'No se encontró el cliente para guardar el ID de CRM.' }
  revalidatePath('/dashboard/platform')
  return { success: true, client: data }
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
