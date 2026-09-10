import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCrmClient } from '@/lib/supabase/crm'

export const runtime = 'nodejs'

const messageColumns = 'id,created_at,client_id,contact_id,conversation_id,message_type,direction,status,source,delivered_at,metadata'
const contactColumns = 'id,created_at,client_id,name,email,phone'
const opportunityColumns = 'id,created_at,client_id,contact_id,pipeline_id,stage_id,assigned_user,status,conversation_id,assigned_team_id,assigned_type,amount,currency'
const stageColumns = 'id,client_id,pipeline_id,name,description'
const conversationColumns = 'id,client_id,contact_id,assigned_agent,assigned_user,importance,unread_count,sub_channel_id,pipeline_id,name,description,created_at,updated_at'

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)))
}

export async function GET(request: NextRequest) {
  const appSupabase = await createClient()
  const { data: { user } } = await appSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('client_id')?.trim()
  const dateFrom = request.nextUrl.searchParams.get('date_from')
  const dateTo = request.nextUrl.searchParams.get('date_to')
  if (!clientId || !isDate(dateFrom) || !isDate(dateTo)) {
    return NextResponse.json({ error: 'client_id, date_from y date_to son obligatorios' }, { status: 400 })
  }
  if (dateFrom > dateTo) return NextResponse.json({ error: 'date_from no puede ser posterior a date_to' }, { status: 400 })

  try {
    const crm = createCrmClient()
    const start = `${dateFrom}T00:00:00.000Z`
    const end = `${dateTo}T23:59:59.999Z`

    const [messagesResult, contactsResult, opportunitiesResult, stagesResult, conversationsResult] = await Promise.all([
      crm.from('messages').select(messageColumns).eq('client_id', clientId).eq('direction', 'inbound').not('metadata', 'is', null).gte('created_at', start).lte('created_at', end).not('metadata->referral', 'is', null).order('created_at', { ascending: true }).limit(2000),
      crm.from('contacts').select(contactColumns).eq('client_id', clientId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true }).limit(2000),
      crm.from('opportunities').select(opportunityColumns).eq('client_id', clientId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }).limit(2000),
      crm.from('pipeline_stages').select(stageColumns).eq('client_id', clientId).limit(500),
      crm.from('conversations').select(conversationColumns).eq('client_id', clientId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }).limit(2000),
    ])

    const failed = [messagesResult, contactsResult, opportunitiesResult, stagesResult, conversationsResult].find(result => result.error)
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 502 })

    const messages = messagesResult.data ?? []
    const contacts = contactsResult.data ?? []
    const opportunities = opportunitiesResult.data ?? []
    const stages = stagesResult.data ?? []
    const conversations = conversationsResult.data ?? []
    const stageById = new Map(stages.map(stage => [stage.id, stage]))
    const contactById = new Map(contacts.map(contact => [contact.id, contact]))
    const conversationById = new Map(conversations.map(conversation => [conversation.id, conversation]))

    const referrals = messages.map(message => {
      const metadata = message.metadata as { referral?: Record<string, unknown> } | null
      const referral = metadata?.referral ?? null
      return {
        ...message,
        referral,
        ad_id: typeof referral?.source_id === 'string' ? referral.source_id : typeof referral?.ad_id === 'string' ? referral.ad_id : null,
        ad_title: typeof referral?.ad_title === 'string' ? referral.ad_title : null,
      }
    }).filter(message => message.referral)

    const sales = opportunities.filter(opportunity => String(opportunity.status ?? '').toLowerCase() === 'won').map(opportunity => ({
      ...opportunity,
      stage: stageById.get(opportunity.stage_id) ?? null,
      contact: contactById.get(opportunity.contact_id) ?? null,
      conversation: conversationById.get(opportunity.conversation_id) ?? null,
      referral: referrals.find(message => message.contact_id === opportunity.contact_id && message.created_at <= opportunity.created_at) ?? null,
    }))

    return NextResponse.json({
      filters: { client_id: clientId, date_from: dateFrom, date_to: dateTo },
      contacts,
      opportunities,
      won_opportunities: sales,
      pipeline_stages: stages,
      conversations,
      referral_messages: referrals,
      totals: { contacts: contacts.length, opportunities: opportunities.length, won_opportunities: sales.length, referral_messages: referrals.length },
    }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('[CRM analysis] Error consultando Aurelia CRM:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo consultar Aurelia CRM' }, { status: 500 })
  }
}
