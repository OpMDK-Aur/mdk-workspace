import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createCrmClient } from '@/lib/supabase/crm'

// El CRM externo de Aurelia identifica a cada cliente con su propio UUID de
// cuenta/location (columna `client_id` en sus tablas remotas), que NO es
// igual a nuestro `clientId` interno. Un mismo cliente interno puede tener
// además varias cuentas de Aurelia vinculadas (ver `client_crm_accounts`).
export async function resolveCrmAccountIds(clientId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: clienteRow }, { data: extraAccounts }] = await Promise.all([
    admin.from('clientes').select('crm_location_id, ghl_location_id').eq('id', clientId).maybeSingle(),
    admin.from('client_crm_accounts').select('crm_account_id').eq('client_id', clientId).eq('crm_type', 'aurelia').eq('active', true),
  ])
  const primaryId = clienteRow?.crm_location_id ?? clienteRow?.ghl_location_id ?? null
  const extraIds = (extraAccounts ?? []).map((row: { crm_account_id: string }) => row.crm_account_id)
  return [...new Set([primaryId, ...extraIds].filter(Boolean) as string[])]
}

export type CrmAcquisitionFilters = {
  campaigns?: string[]
  tags?: string[]
  vendors?: string[]
  channels?: string[]
  teams?: string[]
  statuses?: string[]
}

export type CrmBreakdownRow = { label: string; contacts: number; sales: number }

export type CrmAcquisitionReport =
  | { available: false; message: string }
  | {
      available: true
      totals: { contacts: number; sales: number }
      filterOptions: { campaigns: string[]; tags: string[]; vendors: string[]; channels: string[]; teams: string[]; statuses: string[] }
      campaignRows: CrmBreakdownRow[]
      vendorRows: CrmBreakdownRow[]
      teamRows: CrmBreakdownRow[]
      tagRows: CrmBreakdownRow[]
    }

const UNASSIGNED_CAMPAIGN = 'Sin campaña asignada'
const UNASSIGNED_CHANNEL = 'Sin canal identificado'
const UNASSIGNED_VENDOR = 'Sin vendedor asignado'
const UNASSIGNED_TEAM = 'Sin equipo asignado'
const UNASSIGNED_TAG = 'Sin etiqueta'

const STATUS_LABELS: Record<string, string> = { open: 'Abierta', won: 'Ganada', ganado: 'Ganada', lost: 'Perdida', perdido: 'Perdida', abandoned: 'Abandonada' }
const statusLabel = (status: string | null) => { const key = String(status ?? '').toLowerCase().trim(); return STATUS_LABELS[key] ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Sin estado') }
const isWonStatus = (status: string | null) => ['won', 'ganado'].includes(String(status ?? '').toLowerCase().trim())

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function referralValue(referral: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = referral[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

// Clasifica referrals de pauta sin exponer el JSON de tracking en el CRM.
// El valor devuelto combina origen y nombre: "Google · campaña".
function extractCampaignFromMessage(message: { metadata?: Record<string, unknown> | null }): string | null {
  const referral = message.metadata?.referral as Record<string, unknown> | undefined
  if (!referral || typeof referral !== 'object') return null
  const entryPoint = referralValue(referral, 'entry_point_conversion_source')?.toLowerCase()
  const utmSource = referralValue(referral, 'utm_source')?.toLowerCase()
  const sourceType = referralValue(referral, 'source_type')?.toLowerCase()
  const conversionApp = referralValue(referral, 'entry_point_conversion_app')?.toLowerCase()
  const hasClickId = ['gclid', 'gbraid', 'wbraid', 'gad_campaignid', 'ctwa_clid', 'ad_id'].some((key) => referralValue(referral, key) !== null)
  const hasUtm = Object.keys(referral).some((key) => key.startsWith('utm_') && referralValue(referral, key) !== null)

  if (entryPoint === 'global_search_new_chat' || entryPoint === 'global_search' || (!hasClickId && !hasUtm)) return null

  if (utmSource === 'google' || ['gclid', 'gbraid', 'wbraid', 'gad_campaignid'].some((key) => referralValue(referral, key) !== null)) {
    return `Google · ${referralValue(referral, 'utm_campaign') ?? 'Google Ads'}`
  }

  if (sourceType === 'ad' && conversionApp === 'facebook' && referralValue(referral, 'form_id', 'form_name') === null) {
    return `Meta WhatsApp · ${referralValue(referral, 'ad_title') ?? 'Meta WhatsApp Ads'}`
  }

  if (sourceType === 'facebook' && referralValue(referral, 'form_id', 'form_name') !== null) {
    return `Meta Formulario · ${referralValue(referral, 'utm_campaign', 'form_name') ?? 'Meta Lead Ads'}`
  }

  return null
}

type ContactRecord = { contactId: string; tagNames: string[]; channelName: string | null; campaign: string | null }
type OpportunityRecord = { contactId: string; vendorName: string; teamName: string; statusLabel: string; isWon: boolean }

function passesContactFilters(record: ContactRecord, filters: Required<CrmAcquisitionFilters>): boolean {
  if (filters.campaigns.length && !filters.campaigns.includes(record.campaign ?? UNASSIGNED_CAMPAIGN)) return false
  if (filters.tags.length && !record.tagNames.some((tag) => filters.tags.includes(tag)) && !(filters.tags.includes(UNASSIGNED_TAG) && record.tagNames.length === 0)) return false
  if (filters.channels.length && !filters.channels.includes(record.channelName ?? UNASSIGNED_CHANNEL)) return false
  return true
}

function passesOpportunityFilters(opportunity: OpportunityRecord, filters: Required<CrmAcquisitionFilters>): boolean {
  if (filters.vendors.length && !filters.vendors.includes(opportunity.vendorName)) return false
  if (filters.teams.length && !filters.teams.includes(opportunity.teamName)) return false
  if (filters.statuses.length && !filters.statuses.includes(opportunity.statusLabel)) return false
  return true
}

export async function getCrmAcquisitionReport(clientId: string, dateFrom: string, dateTo: string, filters: CrmAcquisitionFilters = {}): Promise<CrmAcquisitionReport> {
  const crmAccountIds = await resolveCrmAccountIds(clientId)
  if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de CRM vinculada.' }

  const normalizedFilters: Required<CrmAcquisitionFilters> = { campaigns: filters.campaigns ?? [], tags: filters.tags ?? [], vendors: filters.vendors ?? [], channels: filters.channels ?? [], teams: filters.teams ?? [], statuses: filters.statuses ?? [] }
  const crm = createCrmClient()
  const start = new Date(`${dateFrom}T00:00:00-03:00`).toISOString()
  const endExclusive = new Date(`${dateTo}T00:00:00-03:00`)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
  const end = endExclusive.toISOString()

  try {
    // 1. Contactos y oportunidades creados en el período, con tope de
    // seguridad (5000 filas) igual al usado por las demás tools de CRM.
    const fetchAll = async (table: string, columns: string, extra?: (query: any) => any, maxRows = 5000) => {
      const rows: any[] = []
      for (let offset = 0; offset < maxRows; offset += 200) {
        let query = crm.from(table).select(columns).in('client_id', crmAccountIds).gte('created_at', start).lt('created_at', end)
        if (extra) query = extra(query)
        const { data, error } = await query.range(offset, offset + 199)
        if (error) throw new Error(`${table}: ${error.message}`)
        rows.push(...(data ?? []))
        if ((data ?? []).length < 200) break
      }
      return rows
    }

    const [contactsRaw, opportunitiesRaw] = await Promise.all([
      fetchAll('contacts', 'id,client_id,created_at'),
      fetchAll('opportunities', 'id,client_id,contact_id,assigned_user,assigned_team_id,status,amount,created_at'),
    ])

    const contactIds = [...new Set([...contactsRaw.map((row) => row.id), ...opportunitiesRaw.map((row) => row.contact_id)].filter(Boolean))]
    const vendorIds = [...new Set(opportunitiesRaw.map((row) => row.assigned_user).filter(Boolean))]
    const teamIds = [...new Set(opportunitiesRaw.map((row) => row.assigned_team_id).filter(Boolean))]

    // 2. Datos de referencia: usuarios (vendedores), equipos de venta,
    // etiquetas y canales. Todas acotadas a las cuentas del cliente activo.
    const [usersResult, teamsResult, tagsResult, channelsResult] = await Promise.all([
      vendorIds.length ? crm.from('users').select('id,name').in('client_id', crmAccountIds).in('id', vendorIds) : Promise.resolve({ data: [] as any[] }),
      teamIds.length ? crm.from('sales_teams').select('id,name').in('client_id', crmAccountIds).in('id', teamIds) : Promise.resolve({ data: [] as any[] }),
      crm.from('tags').select('id,name').in('client_id', crmAccountIds).limit(1000),
      crm.from('channels').select('id,name').limit(200),
    ])
    const vendorNameById = new Map((usersResult.data ?? []).map((row) => [row.id, row.name as string]))
    const teamNameById = new Map((teamsResult.data ?? []).map((row) => [row.id, row.name as string]))
    const tagNameById = new Map((tagsResult.data ?? []).map((row) => [row.id, row.name as string]))
    const channelNameById = new Map((channelsResult.data ?? []).map((row) => [row.id, row.name as string]))

    // 3. Etiquetas por contacto, conversaciones (para el canal) y mensajes
    // inbound con metadata de referral (para la atribución de campaña).
    // `contact_tags` no tiene `client_id`, así que se filtra por lote de
    // `contact_id` ya acotados a las cuentas del cliente.
    const contactTagRows: Array<{ contact_id: string; tag_id: string }> = []
    const conversationRows: Array<{ contact_id: string; channel_id: string | null }> = []
    const messageRows: Array<{ contact_id: string; metadata: Record<string, unknown> | null; created_at: string }> = []
    for (const batch of chunk(contactIds, 150)) {
      const [tagsBatch, conversationsBatch, messagesBatch] = await Promise.all([
        crm.from('contact_tags').select('contact_id,tag_id').in('contact_id', batch),
        crm.from('conversations').select('contact_id,channel_id').in('client_id', crmAccountIds).in('contact_id', batch),
        crm.from('messages').select('contact_id,metadata,created_at').in('client_id', crmAccountIds).in('contact_id', batch).eq('direction', 'inbound').not('metadata', 'is', null).limit(1000),
      ])
      contactTagRows.push(...((tagsBatch.data ?? []) as any[]))
      conversationRows.push(...((conversationsBatch.data ?? []) as any[]))
      messageRows.push(...((messagesBatch.data ?? []) as any[]))
    }

    const tagNamesByContact = new Map<string, string[]>()
    for (const row of contactTagRows) {
      const name = tagNameById.get(row.tag_id)
      if (!name) continue
      tagNamesByContact.set(row.contact_id, [...(tagNamesByContact.get(row.contact_id) ?? []), name])
    }
    const channelByContact = new Map<string, string>()
    for (const row of conversationRows) {
      if (channelByContact.has(row.contact_id) || !row.channel_id) continue
      const name = channelNameById.get(row.channel_id)
      if (name) channelByContact.set(row.contact_id, name)
    }
    const campaignByContact = new Map<string, string>()
    for (const message of messageRows.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (campaignByContact.has(message.contact_id)) continue
      const campaign = extractCampaignFromMessage(message)
      if (campaign) campaignByContact.set(message.contact_id, campaign)
    }

    const attributedContactIds = contactIds.filter((id) => campaignByContact.has(id))
    const contactRecords = new Map<string, ContactRecord>()
    for (const id of attributedContactIds) contactRecords.set(id, { contactId: id, tagNames: tagNamesByContact.get(id) ?? [], channelName: channelByContact.get(id) ?? null, campaign: campaignByContact.get(id) ?? null })

    const opportunityRecords: OpportunityRecord[] = opportunitiesRaw.filter((row) => row.contact_id).map((row) => ({
      contactId: row.contact_id,
      vendorName: vendorNameById.get(row.assigned_user) ?? UNASSIGNED_VENDOR,
      teamName: teamNameById.get(row.assigned_team_id) ?? UNASSIGNED_TEAM,
      statusLabel: statusLabel(row.status),
      isWon: isWonStatus(row.status),
    }))

    // 4. Opciones de filtro: se calculan sobre el universo completo del
    // período (sin aplicar los filtros ya seleccionados) para que el
    // usuario siempre pueda ampliar la selección.
    const filterOptions = {
      campaigns: [...new Set(attributedContactIds.map((id) => contactRecords.get(id)?.campaign ?? UNASSIGNED_CAMPAIGN))].sort(),
      tags: [...new Set(attributedContactIds.flatMap((id) => contactRecords.get(id)?.tagNames.length ? contactRecords.get(id)!.tagNames : [UNASSIGNED_TAG]))].sort(),
      channels: [...new Set(attributedContactIds.map((id) => contactRecords.get(id)?.channelName ?? UNASSIGNED_CHANNEL))].sort(),
      vendors: [...new Set(opportunityRecords.map((row) => row.vendorName))].sort(),
      teams: [...new Set(opportunityRecords.map((row) => row.teamName))].sort(),
      statuses: [...new Set(opportunityRecords.map((row) => row.statusLabel))].sort(),
    }

    // 5. Agregaciones. Campaña/Etiqueta se basan en contactos (la
    // atribución vive del lado del contacto); Vendedor/Equipo se basan en
    // oportunidades (esos campos solo existen ahí). Todas respetan el
    // resto de los filtros seleccionados por el usuario.
    const eligibleContactIds = attributedContactIds.filter((id) => {
      const record = contactRecords.get(id)
      if (!record) return false
      if (!passesContactFilters(record, normalizedFilters)) return false
      if (!normalizedFilters.vendors.length && !normalizedFilters.teams.length && !normalizedFilters.statuses.length) return true
      return opportunityRecords.some((opportunity) => opportunity.contactId === id && passesOpportunityFilters(opportunity, normalizedFilters))
    })
    const eligibleContactIdSet = new Set(eligibleContactIds)
    const salesByContact = (id: string) => opportunityRecords.filter((opportunity) => opportunity.contactId === id && opportunity.isWon && passesOpportunityFilters(opportunity, normalizedFilters)).length

    const campaignGroups = new Map<string, { contacts: Set<string>; sales: number }>()
    const tagGroups = new Map<string, { contacts: Set<string>; sales: number }>()
    for (const id of eligibleContactIds) {
      const record = contactRecords.get(id)!
      const sales = salesByContact(id)
      const campaignKey = record.campaign ?? UNASSIGNED_CAMPAIGN
      const campaignGroup = campaignGroups.get(campaignKey) ?? { contacts: new Set<string>(), sales: 0 }
      campaignGroup.contacts.add(id); campaignGroup.sales += sales; campaignGroups.set(campaignKey, campaignGroup)

      const tagKeys = normalizedFilters.tags.length ? record.tagNames.filter((tag) => normalizedFilters.tags.includes(tag)) : (record.tagNames.length ? record.tagNames : [UNASSIGNED_TAG])
      for (const tagKey of tagKeys) {
        const tagGroup = tagGroups.get(tagKey) ?? { contacts: new Set<string>(), sales: 0 }
        tagGroup.contacts.add(id); tagGroup.sales += sales; tagGroups.set(tagKey, tagGroup)
      }
    }

    const vendorGroups = new Map<string, { contacts: Set<string>; sales: number }>()
    const teamGroups = new Map<string, { contacts: Set<string>; sales: number }>()
    for (const opportunity of opportunityRecords) {
      if (!eligibleContactIdSet.has(opportunity.contactId) || !passesOpportunityFilters(opportunity, normalizedFilters)) continue
      const vendorGroup = vendorGroups.get(opportunity.vendorName) ?? { contacts: new Set<string>(), sales: 0 }
      vendorGroup.contacts.add(opportunity.contactId); if (opportunity.isWon) vendorGroup.sales += 1; vendorGroups.set(opportunity.vendorName, vendorGroup)

      const teamGroup = teamGroups.get(opportunity.teamName) ?? { contacts: new Set<string>(), sales: 0 }
      teamGroup.contacts.add(opportunity.contactId); if (opportunity.isWon) teamGroup.sales += 1; teamGroups.set(opportunity.teamName, teamGroup)
    }

    const toRows = (groups: Map<string, { contacts: Set<string>; sales: number }>): CrmBreakdownRow[] => [...groups.entries()].map(([label, value]) => ({ label, contacts: value.contacts.size, sales: value.sales })).sort((a, b) => b.contacts - a.contacts)

    return {
      available: true,
      totals: { contacts: eligibleContactIds.length, sales: eligibleContactIds.reduce((sum, id) => sum + salesByContact(id), 0) },
      filterOptions,
      campaignRows: toRows(campaignGroups),
      vendorRows: toRows(vendorGroups),
      teamRows: toRows(teamGroups),
      tagRows: toRows(tagGroups),
    }
  } catch (error) {
    return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar el CRM.' }
  }
}
