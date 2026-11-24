import 'server-only'
import { createCrmClient } from '@/lib/supabase/crm'
import { campaignFromGhlContact, extractCampaignFromMessage } from '@/lib/crm/service'
import { fetchAllGhlContacts, type GhlContact } from '@/lib/revops/ghl-client'
import { ONBOARDING_PIPELINE_ID } from './onboarding-shared'
import { mergeOrigins, normalizeEmail, originFromLabel, phoneKey, type AureliaOriginsData, type ClientOrigin } from './origins-shared'

const PAGE_SIZE = 1000
const MAX_CONTACTS = 30000
const CACHE_TTL_MS = 10 * 60 * 1000

type Crm = ReturnType<typeof createCrmClient>
type MessageRow = { contact_id: string | null; conversation_id: string; metadata: Record<string, unknown> | null; created_at: string }

let cache: { at: number; data: Promise<AureliaOriginsData> } | null = null

/**
 * Origen de cada cliente del CRM de Aurelia. Se busca su teléfono entre los contactos de la cuenta
 * propia de Aurelia (la dueña del pipeline de onboarding), luego sus conversaciones y, dentro de
 * ellas, el primer mensaje con `metadata.referral` (anuncio de Meta, Google, etc.).
 * Se cachea 10 minutos por instancia porque recorre varias tablas del CRM.
 */
export function getAureliaOrigins(): Promise<AureliaOriginsData> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data
  const data = loadOrigins().catch((error): AureliaOriginsData => {
    console.error('[Aurelia] Error calculando el origen de las ventas:', error)
    return { available: false, message: error instanceof Error ? `No se pudo calcular el origen: ${error.message}` : 'No se pudo calcular el origen.' }
  })
  cache = { at: Date.now(), data }
  data.then((result) => { if (!result.available) cache = null })
  return data
}

async function paged<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string, max: number) {
  const rows: T[] = []
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return rows
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function aureliaAccountId(crm: Crm) {
  const { data, error } = await crm.from('pipelines').select('client_id').eq('id', ONBOARDING_PIPELINE_ID).maybeSingle()
  if (error) throw new Error(`pipelines: ${error.message}`)
  const id = (data as { client_id?: string | null } | null)?.client_id
  if (!id) throw new Error('no se encontró la cuenta de Aurelia en el CRM')
  return id
}

type GhlIndex = { byEmail: Map<string, GhlContact>; byPhone: Map<string, GhlContact>; contacts: number }

/** Todos los contactos de la subcuenta de GHL de Aurelia, indexados por email y teléfono (gana el más viejo). */
async function loadGhlIndex(): Promise<GhlIndex | null> {
  const locationId = process.env.AURELIA_GHL_LOCATION_ID?.trim()
  const token = process.env.AURELIA_GHL_TOKEN?.trim()
  if (!locationId || !token) return null
  const contacts = await fetchAllGhlContacts({ locationId, token })
  const byEmail = new Map<string, GhlContact>()
  const byPhone = new Map<string, GhlContact>()
  const oldestFirst = [...contacts].sort((a, b) => String(a.dateAdded ?? '').localeCompare(String(b.dateAdded ?? '')))
  for (const contact of oldestFirst) {
    const email = normalizeEmail(contact.email)
    if (email && !byEmail.has(email)) byEmail.set(email, contact)
    const phone = phoneKey(contact.phone)
    if (phone && !byPhone.has(phone)) byPhone.set(phone, contact)
  }
  return { byEmail, byPhone, contacts: contacts.length }
}

function ghlOrigin(index: GhlIndex, client: { email: string | null; phone: string | null }): ClientOrigin | null {
  const email = normalizeEmail(client.email)
  const phone = phoneKey(client.phone)
  const contact = (email && index.byEmail.get(email)) || (phone && index.byPhone.get(phone)) || null
  if (!contact) return null
  return originFromLabel(campaignFromGhlContact(contact), contact.dateAdded ?? null, 'ghl')
}

async function loadOrigins(): Promise<AureliaOriginsData> {
  const crm = createCrmClient()
  const accountId = await aureliaAccountId(crm)

  // GHL es un complemento: si falla, se sigue con lo del CRM y se avisa.
  const ghlPromise = loadGhlIndex().then(
    (index) => ({ index, error: null as string | null }),
    (error) => ({ index: null, error: error instanceof Error ? error.message : 'No se pudo consultar GoHighLevel' }),
  )

  const [clients, contacts] = await Promise.all([
    paged<{ id: string; phone: string | null; email: string | null }>((from, to) => crm.from('clients').select('id,phone,email').order('id').range(from, to), 'clients', 20000),
    paged<{ id: string; phone: string | null; created_at: string | null }>((from, to) => crm.from('contacts').select('id,phone,created_at').eq('client_id', accountId).order('id').range(from, to), 'contacts', MAX_CONTACTS),
  ])

  // Con teléfonos repetidos gana el contacto más viejo: es el que llegó primero por el anuncio.
  const contactsByPhone = new Map<string, string[]>()
  for (const contact of [...contacts].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))) {
    const key = phoneKey(contact.phone)
    if (key) contactsByPhone.set(key, [...(contactsByPhone.get(key) ?? []), contact.id])
  }

  const contactIdsByClient = new Map<string, string[]>()
  for (const client of clients) {
    const key = phoneKey(client.phone)
    const ids = key ? contactsByPhone.get(key) : undefined
    if (ids?.length) contactIdsByClient.set(String(client.id), ids)
  }
  const contactIds = [...new Set([...contactIdsByClient.values()].flat())]

  const contactByConversation = new Map<string, string>()
  for (const batch of chunk(contactIds, 100)) {
    const rows = await paged<{ id: string; contact_id: string }>((from, to) => crm.from('conversations').select('id,contact_id').eq('client_id', accountId).in('contact_id', batch).order('id').range(from, to), 'conversations', 5000)
    for (const row of rows) contactByConversation.set(String(row.id), String(row.contact_id))
  }

  const firstReferral = new Map<string, { label: string; at: string }>()
  for (const batch of chunk([...contactByConversation.keys()], 50)) {
    const rows = await paged<MessageRow>(
      (from, to) => crm.from('messages').select('contact_id,conversation_id,metadata,created_at').eq('client_id', accountId).in('conversation_id', batch).not('metadata->referral', 'is', null).order('created_at').range(from, to),
      'messages',
      5000,
    )
    for (const row of rows) {
      const contactId = row.contact_id ?? contactByConversation.get(String(row.conversation_id))
      if (!contactId) continue
      const current = firstReferral.get(contactId)
      if (current && current.at <= row.created_at) continue
      const label = extractCampaignFromMessage(row)
      if (label) firstReferral.set(contactId, { label, at: row.created_at })
    }
  }

  const ghl = await ghlPromise
  if (ghl.error) console.error('[Aurelia] Error leyendo contactos de GHL:', ghl.error)

  const origins: Record<string, ClientOrigin> = {}
  for (const client of clients) {
    const ids = contactIdsByClient.get(String(client.id))
    let origin: ClientOrigin
    if (!ids) origin = { kind: 'no-contact', channel: null, label: null, referralAt: null }
    else {
      const referral = ids.map((id) => firstReferral.get(id)).filter((value): value is { label: string; at: string } => Boolean(value)).sort((a, b) => a.at.localeCompare(b.at))[0]
      origin = originFromLabel(referral?.label ?? null, referral?.at ?? null)
    }
    origins[String(client.id)] = mergeOrigins(origin, ghl.index ? ghlOrigin(ghl.index, client) : null)
  }

  return {
    available: true,
    origins,
    generatedAt: new Date().toISOString(),
    ghl: { connected: Boolean(ghl.index), contacts: ghl.index?.contacts ?? 0, error: ghl.error },
  }
}
