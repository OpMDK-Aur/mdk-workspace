import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TABLES = {
  contacts: 'crm_contacts',
  conversations: 'crm_conversations',
  messages: 'crm_messages',
  opportunities: 'crm_opportunities',
} as const

type CrmTable = keyof typeof TABLES
type WebhookPayload = Record<string, unknown> & {
  type?: string
  table?: string
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
  event?: string
}

function text(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (record[key] !== null && record[key] !== undefined) return String(record[key])
  return null
}

function timestamp(record: Record<string, unknown>, ...keys: string[]) {
  return text(record, ...keys)
}

function extractReferralMetadata(record: Record<string, unknown>) {
  const directReferral = record.referral
  if (directReferral && typeof directReferral === 'object' && !Array.isArray(directReferral)) {
    return directReferral as Record<string, unknown>
  }
  const metadata = record.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const referral = (metadata as Record<string, unknown>).referral
  return referral && typeof referral === 'object' && !Array.isArray(referral)
    ? referral as Record<string, unknown>
    : {}
}

function extractSourceId(record: Record<string, unknown>) {
  const referral = extractReferralMetadata(record)
  return text(referral, 'source_id', 'sourceId') ?? text(record, 'source_id', 'sourceId')
}

export async function POST(request: Request) {
  let payload: WebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const path = new URL(request.url).pathname
  const expectedTable = path.endsWith('/contacts') ? 'contacts' : path.endsWith('/messages') ? 'messages' : null
  const eventName = String(payload.event ?? '').toLowerCase()
  const inferredTable = eventName.startsWith('contact_') ? 'contacts' : eventName.startsWith('message_') ? 'messages' : null
  const table = (payload.table ?? expectedTable ?? inferredTable) as CrmTable
  const record = payload.record ?? payload
  const type = String(payload.type ?? (eventName.endsWith('_insert') ? 'INSERT' : eventName.endsWith('_update') ? 'UPDATE' : '')).toUpperCase()
  if (!record || !(table in TABLES) || (expectedTable && table !== expectedTable) || !['INSERT', 'UPDATE'].includes(type)) {
    return NextResponse.json({ error: 'Unsupported webhook payload' }, { status: 400 })
  }

  const externalId = text(record, 'id', 'external_id')
  if (!externalId) return NextResponse.json({ error: 'Missing record id' }, { status: 400 })

  const eventId = request.headers.get('x-supabase-event-id') ?? createHash('sha256').update(JSON.stringify({ type, table, record })).digest('hex')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: eventError } = await supabase.from('crm_sync_events').insert({ event_id: eventId, event_type: type, table_name: table, external_id: externalId })
  if (eventError?.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
  if (eventError) return NextResponse.json({ error: 'Could not register event' }, { status: 500 })

  const aureliaAccountId = text(record, 'aurelia_account_id', 'aureliaAccountId', 'account_id', 'accountId', 'cliente_id', 'client_id')
  let internalClientId = text(record, 'internal_client_id')
  if (aureliaAccountId) {
    const { data: accountMapping } = await supabase
      .from('client_crm_accounts')
      .select('client_id')
      .eq('crm_type', 'aurelia')
      .eq('crm_account_id', aureliaAccountId)
      .eq('active', true)
      .maybeSingle()
    internalClientId = accountMapping?.client_id ?? internalClientId
  }
  if (!internalClientId) {
    await supabase.from('crm_sync_events').update({ status: 'failed', processed_at: new Date().toISOString(), error_message: 'No client mapping found' }).eq('event_id', eventId)
    return NextResponse.json({ error: 'No client mapping found' }, { status: 422 })
  }

  const common = {
    external_id: externalId,
    client_id: internalClientId,
    created_at: timestamp(record, 'created_at', 'createdAt', 'creado_en'),
    crm_created_at: timestamp(record, 'created_at', 'createdAt', 'creado_en'),
    crm_updated_at: timestamp(record, 'updated_at', 'updatedAt', 'actualizado_en'),
    synced_at: new Date().toISOString(),
  }
  const data = table === 'contacts'
    ? { ...common, contact_data: record, source: text(record, 'source', 'lead_source', 'origen'), status: text(record, 'status', 'estado') }
    : table === 'conversations'
      ? { ...common, contact_external_id: text(record, 'contact_id', 'contactId', 'contact_external_id'), conversation_data: record, channel: text(record, 'channel', 'canal'), status: text(record, 'status', 'estado') }
      : table === 'messages'
        ? { ...common, conversation_external_id: text(record, 'conversation_id', 'conversationId', 'converation_id', 'converationId'), contact_external_id: text(record, 'contact_id', 'contactId'), message_data: record, source_id: extractSourceId(record), referral_metadata: extractReferralMetadata(record), direction: text(record, 'direction', 'direccion'), author: text(record, 'author', 'sender', 'remetente') }
        : { ...common, contact_external_id: text(record, 'contact_id', 'contactId'), opportunity_data: record, stage: text(record, 'stage', 'pipeline_stage', 'etapa'), status: text(record, 'status', 'estado'), value: Number(record.value ?? record.amount ?? record.monto ?? 0) || null, source: text(record, 'source', 'lead_source', 'origen') }

  const { error } = await supabase.from(TABLES[table]).upsert(data, { onConflict: 'external_id' })
  await supabase.from('crm_sync_events').update({ status: error ? 'failed' : 'processed', processed_at: new Date().toISOString(), error_message: error?.message ?? null }).eq('event_id', eventId)
  if (error) return NextResponse.json({ error: 'CRM sync failed' }, { status: 500 })
  return NextResponse.json({ ok: true, table, external_id: externalId })
}
